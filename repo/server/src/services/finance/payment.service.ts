import { Payment } from '../../models/payment.model';
import { Invoice } from '../../models/invoice.model';
import { Order } from '../../models/order.model';
import { PaymentMethod, PaymentStatus, InvoiceStatus } from '../../types/enums';
import { NotFoundError, BadRequestError } from '../../lib/errors';
import { recordTransaction } from './wallet-ledger.service';
import logger from '../../lib/logger';

interface PaymentInput {
  orderId: string;
  invoiceId: string;
  dealershipId: string;
  method: PaymentMethod;
  amount: number;
  idempotencyKey: string;
  metadata?: Record<string, any>;
}

export async function processPayment(input: PaymentInput) {
  const existing = await Payment.findOne({ idempotencyKey: input.idempotencyKey });
  if (existing) return existing;

  const invoice = await Invoice.findById(input.invoiceId);
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status === InvoiceStatus.PAID) {
    throw new BadRequestError('Invoice already paid');
  }

  if (input.amount !== invoice.total) {
    throw new BadRequestError(
      `Payment amount (${input.amount}) does not match invoice total (${invoice.total})`
    );
  }

  const order = await Order.findById(input.orderId);
  if (!order) throw new NotFoundError('Order not found');

  const payment = new Payment({
    dealershipId: input.dealershipId,
    orderId: input.orderId,
    invoiceId: input.invoiceId,
    method: input.method,
    amount: input.amount,
    status: PaymentStatus.COMPLETED,
    adapterUsed: null,
    metadata: input.metadata || {},
    idempotencyKey: input.idempotencyKey,
  });

  await payment.save();

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
  await invoice.save();

  logger.info(
    { paymentId: payment._id, orderId: input.orderId, amount: input.amount, method: input.method },
    'Payment processed'
  );

  return payment;
}

export async function getPaymentsByOrder(orderId: string) {
  return Payment.find({ orderId });
}
