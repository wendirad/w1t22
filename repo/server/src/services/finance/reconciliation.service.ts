import { Order } from '../../models/order.model';
import { Invoice } from '../../models/invoice.model';
import { Payment } from '../../models/payment.model';
import { ReconciliationRun } from '../../models/reconciliation-run.model';
import { Dealership } from '../../models/dealership.model';
import { OrderStatus, InvoiceStatus, PaymentStatus } from '../../types/enums';
import logger from '../../lib/logger';

export async function runReconciliation() {
  const dealerships = await Dealership.find({ isActive: true });
  const results = [];

  for (const dealership of dealerships) {
    try {
      const result = await reconcileDealership(dealership._id.toString());
      results.push(result);
    } catch (error: any) {
      logger.error(
        { dealershipId: dealership._id, error: error.message },
        'Reconciliation failed for dealership'
      );
      results.push(
        await ReconciliationRun.create({
          dealershipId: dealership._id,
          period: {
            from: new Date(Date.now() - 24 * 60 * 60 * 1000),
            to: new Date(),
          },
          status: 'failed',
          discrepancies: [{ type: 'error', referenceId: dealership._id, details: error.message }],
        })
      );
    }
  }

  return results;
}

async function reconcileDealership(dealershipId: string) {
  const periodEnd = new Date();
  periodEnd.setHours(0, 0, 0, 0);
  const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);

  const orders = await Order.find({
    dealershipId,
    status: { $in: [OrderStatus.SETTLED, OrderStatus.FULFILLED] },
    updatedAt: { $gte: periodStart, $lt: periodEnd },
  });

  const orderIds = orders.map((o) => o._id);

  const invoices = await Invoice.find({
    dealershipId,
    orderId: { $in: orderIds },
    status: { $in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID] },
  });

  const invoiceIds = invoices.map((i) => i._id);

  const payments = await Payment.find({
    dealershipId,
    invoiceId: { $in: invoiceIds },
    status: PaymentStatus.COMPLETED,
  });

  const invoiceByOrder = new Map(invoices.map((i) => [i.orderId.toString(), i]));
  const paymentsByInvoice = new Map<string, typeof payments>();
  for (const p of payments) {
    const key = p.invoiceId.toString();
    if (!paymentsByInvoice.has(key)) paymentsByInvoice.set(key, []);
    paymentsByInvoice.get(key)!.push(p);
  }

  const discrepancies: Array<{ type: string; referenceId: any; details: string }> = [];
  const unmatchedOrders: any[] = [];
  const unmatchedInvoices: any[] = [];
  const unmatchedSettlements: any[] = [];
  let matchedCount = 0;

  for (const order of orders) {
    const invoice = invoiceByOrder.get(order._id.toString());
    if (!invoice) {
      unmatchedOrders.push(order._id);
      discrepancies.push({
        type: 'missing_invoice',
        referenceId: order._id,
        details: `Order ${order.orderNumber} has no invoice`,
      });
      continue;
    }

    const orderPayments = paymentsByInvoice.get(invoice._id.toString()) || [];
    const paidAmount = orderPayments.reduce((sum, p) => sum + p.amount, 0);

    if (orderPayments.length === 0) {
      unmatchedInvoices.push(invoice._id);
      discrepancies.push({
        type: 'unpaid_invoice',
        referenceId: invoice._id,
        details: `Invoice ${invoice.invoiceNumber} has no payments`,
      });
    } else if (paidAmount !== invoice.total) {
      discrepancies.push({
        type: 'amount_mismatch',
        referenceId: invoice._id,
        details: `Invoice ${invoice.invoiceNumber}: expected ${invoice.total}, paid ${paidAmount}`,
      });
    } else if (invoice.total !== order.totals.total) {
      discrepancies.push({
        type: 'order_invoice_mismatch',
        referenceId: order._id,
        details: `Order ${order.orderNumber} total (${order.totals.total}) != Invoice total (${invoice.total})`,
      });
    } else {
      matchedCount++;
    }
  }

  const status =
    discrepancies.length > 0 ? 'completed_with_discrepancies' : 'completed';

  const run = await ReconciliationRun.create({
    dealershipId,
    period: { from: periodStart, to: periodEnd },
    matchedCount,
    unmatchedOrders,
    unmatchedInvoices,
    unmatchedSettlements,
    discrepancies,
    status,
  });

  logger.info(
    { dealershipId, matchedCount, discrepancies: discrepancies.length },
    'Reconciliation completed'
  );

  return run;
}
