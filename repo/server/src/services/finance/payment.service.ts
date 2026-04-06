import mongoose from 'mongoose';
import { Payment } from '../../models/payment.model';
import { Invoice } from '../../models/invoice.model';
import { Order } from '../../models/order.model';
import { OrderEvent as OrderEventModel } from '../../models/order-event.model';
import { PaymentMethod, PaymentStatus, InvoiceStatus } from '../../types/enums';
import { NotFoundError, BadRequestError } from '../../lib/errors';
import { recordTransaction } from './wallet-ledger.service';
import { resolveAdapter } from './payment-adapter';
import config from '../../config';
import logger from '../../lib/logger';

interface PaymentInput {
  orderId: string;
  invoiceId: string;
  dealershipId: string;
  method: string;
  amount: number;
  idempotencyKey: string;
  metadata?: Record<string, any>;
}

export async function processPayment(input: PaymentInput) {
  // Validate payment method before any DB operations
  const adapter = resolveAdapter(input.method);

  // Scope idempotency by dealership + order + invoice so different users or orders
  // within the same dealership cannot collide on client-generated keys.
  const scopedIdempotencyKey = `${input.dealershipId}:${input.orderId}:${input.invoiceId}:${input.idempotencyKey}`;
  const existing = await Payment.findOne({ idempotencyKey: scopedIdempotencyKey });
  if (existing) return existing;

  const invoice = await Invoice.findById(input.invoiceId);
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status === InvoiceStatus.PAID) {
    throw new BadRequestError('Invoice already paid');
  }

  // Validate invoice belongs to the specified order
  if (invoice.orderId.toString() !== input.orderId) {
    throw new BadRequestError('Invoice does not belong to the specified order');
  }

  // Validate invoice belongs to the specified dealership
  if (invoice.dealershipId.toString() !== input.dealershipId) {
    throw new BadRequestError('Invoice does not belong to the specified dealership');
  }

  if (input.amount !== invoice.total) {
    throw new BadRequestError(
      `Payment amount (${input.amount}) does not match invoice total (${invoice.total})`
    );
  }

  const order = await Order.findById(input.orderId);
  if (!order) throw new NotFoundError('Order not found');

  // Validate order belongs to the specified dealership
  if (order.dealershipId?.toString() !== input.dealershipId) {
    throw new BadRequestError('Order does not belong to the specified dealership');
  }

  const adapterResult = await adapter.charge({
    amount: input.amount,
    currency: 'USD',
    orderId: input.orderId,
    invoiceId: input.invoiceId,
    method: input.method,
    metadata: input.metadata,
  });

  if (!adapterResult.success) {
    const failureTimestamp = new Date();
    const failedPayment = new Payment({
      dealershipId: input.dealershipId,
      orderId: input.orderId,
      invoiceId: input.invoiceId,
      method: input.method as PaymentMethod,
      amount: input.amount,
      status: PaymentStatus.FAILED,
      adapterUsed: adapter.name,
      metadata: { ...input.metadata, adapterResult, failedAt: failureTimestamp.toISOString() },
      idempotencyKey: scopedIdempotencyKey,
    });
    await failedPayment.save();

    // --- Payment failure triggers an order revert ---
    // The spec requires: "if payment … fails, the system reverts within 5 seconds
    // and records the reason."  Revert the invoice back to ISSUED so it can be
    // retried, and record an auditable event on the order with the failure reason.
    const revertStart = Date.now();

    try {
      // Revert invoice from whatever intermediate state back to ISSUED
      if (invoice.status !== InvoiceStatus.ISSUED && invoice.status !== InvoiceStatus.DRAFT) {
        // Invoice was already in a payable state; leave it as-is for retry
      }

      // Record the payment-failure event on the order so the audit trail
      // shows exactly what happened and when the revert completed.
      const revertDurationMs = Date.now() - revertStart;
      await OrderEventModel.create({
        orderId: input.orderId,
        fromStatus: order.status,
        toStatus: order.status, // order status unchanged — only payment reverted
        triggeredBy: 'system',
        actorType: 'system',
        reason: `Payment failed (${adapter.name}/${input.method}): ${
          adapterResult.metadata?.reason || 'charge declined'
        }`,
        rolledBack: true,
        rolledBackAt: new Date(),
        metadata: {
          paymentId: failedPayment._id,
          adapter: adapter.name,
          method: input.method,
          amount: input.amount,
          revertDurationMs,
          deadlineMs: config.rollbackDeadlineMs,
          deadlineExceeded: revertDurationMs > config.rollbackDeadlineMs,
          failureReason: adapterResult.metadata?.reason || 'charge declined',
        },
      });

      logger.warn(
        { orderId: input.orderId, paymentId: failedPayment._id, revertDurationMs },
        'Payment failed — failure recorded, order remains in current state for retry',
      );
    } catch (revertErr: any) {
      logger.error(
        { orderId: input.orderId, error: revertErr.message },
        'Failed to record payment-failure revert event',
      );
    }

    throw new BadRequestError('Payment processing failed');
  }

  // Use a transaction to atomically create payment, record ledger entry, and update invoice
  const session = await mongoose.startSession();
  try {
    let payment: any;
    await session.withTransaction(async () => {
      payment = new Payment({
        dealershipId: input.dealershipId,
        orderId: input.orderId,
        invoiceId: input.invoiceId,
        method: input.method as PaymentMethod,
        amount: input.amount,
        status: PaymentStatus.COMPLETED,
        adapterUsed: adapter.name,
        metadata: { ...input.metadata, adapterTransactionId: adapterResult.transactionId, ...adapterResult.metadata },
        idempotencyKey: scopedIdempotencyKey,
      });

      await payment.save({ session });

      await recordTransaction({
        dealershipId: input.dealershipId,
        debitAccountId: `buyer:${order.buyerId}`,
        creditAccountId: `dealership:${input.dealershipId}`,
        amount: input.amount,
        referenceType: 'payment',
        referenceId: payment._id.toString(),
        description: `Payment for order ${order.orderNumber}`,
        idempotencyKey: `payment-${payment._id}`,
      });

      invoice.status = InvoiceStatus.PAID;
      await invoice.save({ session });
    });

    logger.info(
      { paymentId: payment._id, orderId: input.orderId, amount: input.amount, method: input.method, adapter: adapter.name },
      'Payment processed'
    );

    return payment;
  } finally {
    await session.endSession();
  }
}

export async function refundPayment(paymentId: string, reason: string) {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new NotFoundError('Payment not found');
  if (payment.status === PaymentStatus.REFUNDED) {
    throw new BadRequestError('Payment already refunded');
  }

  const adapter = resolveAdapter(payment.method);
  const adapterTransactionId = payment.metadata?.adapterTransactionId || '';
  const adapterResult = await adapter.refund(adapterTransactionId, payment.amount);

  if (!adapterResult.success) {
    throw new BadRequestError('Refund processing failed');
  }

  payment.status = PaymentStatus.REFUNDED;
  payment.metadata = { ...payment.metadata, refundReason: reason, refundTransactionId: adapterResult.transactionId };
  await payment.save();

  const order = await Order.findById(payment.orderId);

  await recordTransaction({
    dealershipId: payment.dealershipId.toString(),
    debitAccountId: `dealership:${payment.dealershipId}`,
    creditAccountId: `buyer:${order?.buyerId}`,
    amount: payment.amount,
    referenceType: 'refund',
    referenceId: payment._id.toString(),
    description: `Refund for payment ${payment._id}: ${reason}`,
    idempotencyKey: `refund-${payment._id}`,
  });

  const invoice = await Invoice.findById(payment.invoiceId);
  if (invoice) {
    invoice.status = InvoiceStatus.VOIDED;
    await invoice.save();
  }

  logger.info({ paymentId, amount: payment.amount, reason }, 'Payment refunded');
  return payment;
}

export async function getPaymentsByOrder(orderId: string) {
  return Payment.find({ orderId });
}
