import mongoose, { Schema, Document } from 'mongoose';

export interface IFilterPreset extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  filters: Record<string, any>;
  createdAt: Date;
}

const filterPresetSchema = new Schema<IFilterPreset>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    filters: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

filterPresetSchema.index({ userId: 1 });

export const FilterPreset = mongoose.model<IFilterPreset>('FilterPreset', filterPresetSchema);
