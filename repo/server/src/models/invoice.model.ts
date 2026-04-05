import mongoose, { Schema, Document } from 'mongoose';
import { InvoiceStatus } from '../types/enums';

export interface IInvoice extends Document {
  invoiceNumber: string;
  dealershipId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    taxAmount: number;
    total: number;
  }>;
  subtotal: number;
  taxBreakdown: Array<{
    jurisdiction: string;
    rate: number;
    amount: number;
  }>;
  total: number;
  status: InvoiceStatus;
  isPreview: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const invoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: { type: String, required: true },
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    lineItems: [
      {
        description: { type: String, required: true },
        quantity: { type: Number, default: 1 },
        unitPrice: { type: Number, required: true },
        taxRate: { type: Number, default: 0 },
        taxAmount: { type: Number, default: 0 },
        total: { type: Number, required: true },
      },
    ],
    subtotal: { type: Number, required: true },
    taxBreakdown: [
      {
        jurisdiction: { type: String },
        rate: { type: Number },
        amount: { type: Number },
      },
    ],
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(InvoiceStatus),
      default: InvoiceStatus.DRAFT,
    },
    isPreview: { type: Boolean, default: false },
  },
  { timestamps: true }
);

invoiceSchema.index({ dealershipId: 1, orderId: 1 });
invoiceSchema.index({ invoiceNumber: 1 }, { unique: true });

export const Invoice = mongoose.model<IInvoice>('Invoice', invoiceSchema);
