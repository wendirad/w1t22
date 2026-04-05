import mongoose, { Schema, Document } from 'mongoose';
import { ExperimentStatus } from '../types/enums';

export interface IExperiment extends Document {
  name: string;
  description: string;
  feature: string;
  variants: Array<{
    key: string;
    weight: number;
    config: Record<string, any>;
  }>;
  status: ExperimentStatus;
  startDate: Date;
  endDate: Date | null;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const experimentSchema = new Schema<IExperiment>(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    feature: { type: String, required: true },
    variants: [
      {
        key: { type: String, required: true },
        weight: { type: Number, required: true },
        config: { type: Schema.Types.Mixed, default: {} },
      },
    ],
    status: {
      type: String,
      enum: Object.values(ExperimentStatus),
      default: ExperimentStatus.DRAFT,
    },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const Experiment = mongoose.model<IExperiment>('Experiment', experimentSchema);
