import mongoose, { Schema, Document } from 'mongoose';

export interface IExperimentAssignment extends Document {
  experimentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  variant: string;
  assignedAt: Date;
}

const experimentAssignmentSchema = new Schema<IExperimentAssignment>({
  experimentId: { type: Schema.Types.ObjectId, ref: 'Experiment', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  variant: { type: String, required: true },
  assignedAt: { type: Date, default: Date.now },
});

experimentAssignmentSchema.index({ experimentId: 1, userId: 1 }, { unique: true });

export const ExperimentAssignment = mongoose.model<IExperimentAssignment>(
  'ExperimentAssignment',
  experimentAssignmentSchema
);
