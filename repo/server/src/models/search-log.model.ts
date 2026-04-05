import mongoose, { Schema, Document } from 'mongoose';

export interface ISearchLog extends Document {
  dealershipId: mongoose.Types.ObjectId | null;
  userId: mongoose.Types.ObjectId | null;
  rawQuery: string;
  expandedTerms: string[];
  filters: Record<string, any>;
  resultCount: number;
  timestamp: Date;
}

const searchLogSchema = new Schema<ISearchLog>({
  dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', default: null },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  rawQuery: { type: String, required: true },
  expandedTerms: { type: [String], default: [] },
  filters: { type: Schema.Types.Mixed, default: {} },
  resultCount: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now },
});

searchLogSchema.index({ timestamp: -1 });
searchLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

export const SearchLog = mongoose.model<ISearchLog>('SearchLog', searchLogSchema);
