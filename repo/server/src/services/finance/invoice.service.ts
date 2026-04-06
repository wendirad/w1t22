import { Invoice } from '../../models/invoice.model';
import { Order } from '../../models/order.model';
import { TaxRate } from '../../models/tax-rate.model';
import { Dealership } from '../../models/dealership.model';
import { InvoiceStatus } from '../../types/enums';
import { NotFoundError, BadRequestError } from '../../lib/errors';
import logger from '../../lib/logger';

function generateInvoiceNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  return `INV-${ts}`;
}

/**
 * Pure tax arithmetic — no database access. Exported for unit tests.
 */
export function computeTaxAmount(subtotal: number, rate: number): number {
  return Math.round(subtotal * rate);
}

async function calculateTax(dealershipId: string, subtotal: number) {
  const dealership = await Dealership.findById(dealershipId);
  if (!dealership) return { taxBreakdown: [], totalTax: 0 };

  const state = dealership.address.state;
  const county = dealership.address.county;

  const taxRate = await TaxRate.findOne({
    state: new RegExp(`^${state}$`, 'i'),
    county: county ? new RegExp(`^${county}$`, 'i') : '',
    effectiveDate: { $lte: new Date() },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).sort({ effectiveDate: -1 });

  if (!taxRate) return { taxBreakdown: [], totalTax: 0 };

  const taxAmount = computeTaxAmount(subtotal, taxRate.rate);
  const taxBreakdown = [
    {
      jurisdiction: county ? `${county}, ${state}` : state,
      rate: taxRate.rate,
      amount: taxAmount,
    },
  ];

  return { taxBreakdown, totalTax: taxAmount };
}

export async function generateInvoicePreview(orderId: string) {
  const order = await Order.findById(orderId).populate('items.vehicleId');
  if (!order) throw new NotFoundError('Order not found');

  const { taxBreakdown, totalTax } = await calculateTax(
    order.dealershipId.toString(),
    order.totals.subtotal
  );

  const lineItems = order.items.map((item: any) => {
    const vehicle = item.vehicleId;
    const vehicleTotal = item.subtotal;
    const taxRate = taxBreakdown.length > 0 ? taxBreakdown[0].rate : 0;
    const taxAmount = computeTaxAmount(vehicleTotal, taxRate);

    return {
      description: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Vehicle',
      quantity: 1,
      unitPrice: item.subtotal,
      taxRate,
      taxAmount,
      total: vehicleTotal + taxAmount,
    };
  });

  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    lineItems,
    subtotal: order.totals.subtotal,
    taxBreakdown,
    total: order.totals.subtotal + totalTax,
    isPreview: true,
  };
}

export async function createInvoice(orderId: string) {
  const existing = await Invoice.findOne({ orderId, isPreview: false });
  if (existing) return existing;

  const preview = await generateInvoicePreview(orderId);
  const order = await Order.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');

  const invoice = new Invoice({
    invoiceNumber: generateInvoiceNumber(),
    dealershipId: order.dealershipId,
    orderId,
    lineItems: preview.lineItems,
    subtotal: preview.subtotal,
    taxBreakdown: preview.taxBreakdown,
    total: preview.total,
    status: InvoiceStatus.ISSUED,
    isPreview: false,
  });

  await invoice.save();

  order.totals.tax = preview.total - preview.subtotal;
  order.totals.total = preview.total;
  await order.save();

  logger.info({ invoiceId: invoice._id, orderId }, 'Invoice created');

  return invoice;
}

export async function getInvoice(invoiceId: string) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new NotFoundError('Invoice not found');
  return invoice;
}

export async function getInvoiceByOrder(orderId: string) {
  const invoice = await Invoice.findOne({ orderId, isPreview: false });
  if (!invoice) throw new NotFoundError('Invoice not found for this order');
  return invoice;
}
