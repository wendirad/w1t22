import mongoose, { Schema, Document } from 'mongoose';

export interface ISynonym extends Document {
  canonical: string;
  aliases: string[];
  field: string;
  createdAt: Date;
  updatedAt: Date;
}

const synonymSchema = new Schema<ISynonym>(
  {
    canonical: { type: String, required: true },
    aliases: { type: [String], required: true },
    field: { type: String, required: true, default: 'make' },
  },
  { timestamps: true }
);

synonymSchema.index({ field: 1, aliases: 1 });
synonymSchema.index({ canonical: 1, field: 1 }, { unique: true });

export const Synonym = mongoose.model<ISynonym>('Synonym', synonymSchema);
