import mongoose, { Schema, Document } from 'mongoose';

export interface ITrendingSnapshot extends Document {
  keywords: Array<{
    keyword: string;
    count: number;
  }>;
  period: {
    from: Date;
    to: Date;
  };
  createdAt: Date;
}

const trendingSnapshotSchema = new Schema<ITrendingSnapshot>(
  {
    keywords: [
      {
        keyword: { type: String, required: true },
        count: { type: Number, required: true },
      },
    ],
    period: {
      from: { type: Date, required: true },
      to: { type: Date, required: true },
    },
  },
  { timestamps: true }
);

trendingSnapshotSchema.index({ createdAt: -1 });
trendingSnapshotSchema.index({ 'period.from': 1, 'period.to': 1 });

export const TrendingSnapshot = mongoose.model<ITrendingSnapshot>(
  'TrendingSnapshot',
  trendingSnapshotSchema
);
