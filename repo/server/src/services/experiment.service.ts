import { Experiment } from '../models/experiment.model';
import { ExperimentAssignment } from '../models/experiment-assignment.model';
import { ExperimentStatus } from '../types/enums';
import { NotFoundError, BadRequestError } from '../lib/errors';
import logger from '../lib/logger';

export async function createExperiment(params: {
  name: string;
  description: string;
  feature: string;
  variants: Array<{ key: string; weight: number; config: Record<string, any> }>;
  createdBy: string;
}) {
  const experiment = new Experiment({
    ...params,
    status: ExperimentStatus.DRAFT,
  });
  await experiment.save();
  logger.info({ experimentId: experiment._id, name: experiment.name }, 'Experiment created');
  return experiment;
}

export async function activateExperiment(experimentId: string) {
  const experiment = await Experiment.findById(experimentId);
  if (!experiment) throw new NotFoundError('Experiment not found');
  if (experiment.status !== ExperimentStatus.DRAFT && experiment.status !== ExperimentStatus.PAUSED) {
    throw new BadRequestError('Experiment cannot be activated from current status');
  }
  experiment.status = ExperimentStatus.ACTIVE;
  await experiment.save();
  return experiment;
}

export async function rollbackExperiment(experimentId: string) {
  const experiment = await Experiment.findById(experimentId);
  if (!experiment) throw new NotFoundError('Experiment not found');
  experiment.status = ExperimentStatus.ROLLED_BACK;
  await experiment.save();
  logger.info({ experimentId }, 'Experiment rolled back');
  return experiment;
}

export async function getAssignment(experimentId: string, userId: string) {
  const experiment = await Experiment.findById(experimentId);
  if (!experiment) throw new NotFoundError('Experiment not found');

  if (experiment.status !== ExperimentStatus.ACTIVE) {
    return { variant: experiment.variants[0]?.key || 'control', isDefault: true };
  }

  let assignment = await ExperimentAssignment.findOne({ experimentId, userId });
  if (assignment) {
    return { variant: assignment.variant, isDefault: false };
  }

  const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
  let random = Math.random() * totalWeight;
  let selectedVariant = experiment.variants[0].key;

  for (const variant of experiment.variants) {
    random -= variant.weight;
    if (random <= 0) {
      selectedVariant = variant.key;
      break;
    }
  }

  assignment = await ExperimentAssignment.create({
    experimentId,
    userId,
    variant: selectedVariant,
  });

  return { variant: selectedVariant, isDefault: false };
}

export async function listExperiments() {
  return Experiment.find({}).sort({ createdAt: -1 });
}

export async function getExperiment(experimentId: string) {
  const experiment = await Experiment.findById(experimentId);
  if (!experiment) throw new NotFoundError('Experiment not found');
  return experiment;
}
