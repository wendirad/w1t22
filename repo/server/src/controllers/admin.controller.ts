import { Request, Response, NextFunction } from 'express';
import { Synonym } from '../models/synonym.model';
import { TaxRate } from '../models/tax-rate.model';
import { User } from '../models/user.model';
import { Dealership } from '../models/dealership.model';
import { FilterPreset } from '../models/filter-preset.model';
import { PermissionOverride } from '../models/permission-override.model';
import * as experimentService from '../services/experiment.service';
import { clearSynonymCache } from '../services/search/synonym.service';
import { logAuditEvent } from '../services/audit.service';
import { NotFoundError } from '../lib/errors';
import { parsePaginationParams, buildPaginatedResult } from '../lib/pagination';

export async function listSynonyms(req: Request, res: Response, next: NextFunction) {
  try {
    const synonyms = await Synonym.find({}).sort({ field: 1, canonical: 1 });
    res.json(synonyms);
  } catch (error) {
    next(error);
  }
}

export async function createSynonym(req: Request, res: Response, next: NextFunction) {
  try {
    const synonym = await Synonym.create(req.body);
    clearSynonymCache();
    await logAuditEvent({
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'synonym.create',
      resourceType: 'synonym',
      resourceId: synonym._id?.toString() || '',
      after: { canonical: synonym.canonical, aliases: synonym.aliases },
      requestId: (req as any).requestId,
    });
    res.status(201).json(synonym);
  } catch (error) {
    next(error);
  }
}

export async function updateSynonym(req: Request, res: Response, next: NextFunction) {
  try {
    const before = await Synonym.findById(req.params.id);
    const synonym = await Synonym.findByIdAndUpdate(req.params.id, req.body, { new: true });
    clearSynonymCache();
    await logAuditEvent({
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'synonym.update',
      resourceType: 'synonym',
      resourceId: req.params.id,
      before: before ? { canonical: before.canonical, aliases: before.aliases } : null,
      after: synonym ? { canonical: synonym.canonical, aliases: synonym.aliases } : null,
      requestId: (req as any).requestId,
    });
    res.json(synonym);
  } catch (error) {
    next(error);
  }
}

export async function deleteSynonym(req: Request, res: Response, next: NextFunction) {
  try {
    const before = await Synonym.findById(req.params.id);
    await Synonym.findByIdAndDelete(req.params.id);
    clearSynonymCache();
    await logAuditEvent({
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'synonym.delete',
      resourceType: 'synonym',
      resourceId: req.params.id,
      before: before ? { canonical: before.canonical, aliases: before.aliases } : null,
      requestId: (req as any).requestId,
    });
    res.json({ msg: 'Synonym deleted' });
  } catch (error) {
    next(error);
  }
}

export async function listTaxRates(req: Request, res: Response, next: NextFunction) {
  try {
    const rates = await TaxRate.find({}).sort({ state: 1, county: 1 });
    res.json(rates);
  } catch (error) {
    next(error);
  }
}

export async function createTaxRate(req: Request, res: Response, next: NextFunction) {
  try {
    const rate = await TaxRate.create(req.body);
    await logAuditEvent({
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'tax_rate.create',
      resourceType: 'tax_rate',
      resourceId: rate._id?.toString() || '',
      after: { state: rate.state, county: rate.county, rate: rate.rate },
      requestId: (req as any).requestId,
    });
    res.status(201).json(rate);
  } catch (error) {
    next(error);
  }
}

export async function updateTaxRate(req: Request, res: Response, next: NextFunction) {
  try {
    const before = await TaxRate.findById(req.params.id);
    const rate = await TaxRate.findByIdAndUpdate(req.params.id, req.body, { new: true });
    await logAuditEvent({
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'tax_rate.update',
      resourceType: 'tax_rate',
      resourceId: req.params.id,
      before: before ? { state: before.state, county: before.county, rate: before.rate } : null,
      after: rate ? { state: rate.state, county: rate.county, rate: rate.rate } : null,
      requestId: (req as any).requestId,
    });
    res.json(rate);
  } catch (error) {
    next(error);
  }
}

export async function deleteTaxRate(req: Request, res: Response, next: NextFunction) {
  try {
    const before = await TaxRate.findById(req.params.id);
    await TaxRate.findByIdAndDelete(req.params.id);
    await logAuditEvent({
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'tax_rate.delete',
      resourceType: 'tax_rate',
      resourceId: req.params.id,
      before: before ? { state: before.state, county: before.county, rate: before.rate } : null,
      requestId: (req as any).requestId,
    });
    res.json({ msg: 'Tax rate deleted' });
  } catch (error) {
    next(error);
  }
}

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const query: any = { isActive: true };
    if (req.query.dealershipId) query.dealershipId = req.query.dealershipId;
    if (req.query.role) query.role = req.query.role;
    const users = await User.find(query).select('-passwordHash -refreshToken');
    res.json(users);
  } catch (error) {
    next(error);
  }
}

export async function updateUserRole(req: Request, res: Response, next: NextFunction) {
  try {
    const before = await User.findById(req.params.id).select('role dealershipId');
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: req.body.role, dealershipId: req.body.dealershipId },
      { new: true }
    ).select('-passwordHash -refreshToken');
    await logAuditEvent({
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'user.update_role',
      resourceType: 'user',
      resourceId: req.params.id,
      before: before ? { role: before.role, dealershipId: before.dealershipId } : null,
      after: user ? { role: user.role, dealershipId: user.dealershipId } : null,
      requestId: (req as any).requestId,
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
}

export async function listDealerships(req: Request, res: Response, next: NextFunction) {
  try {
    const dealerships = await Dealership.find({});
    res.json(dealerships);
  } catch (error) {
    next(error);
  }
}

export async function createDealership(req: Request, res: Response, next: NextFunction) {
  try {
    const dealership = await Dealership.create(req.body);
    await logAuditEvent({
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'dealership.create',
      resourceType: 'dealership',
      resourceId: dealership._id?.toString() || '',
      after: { name: dealership.name, region: dealership.region },
      requestId: (req as any).requestId,
    });
    res.status(201).json(dealership);
  } catch (error) {
    next(error);
  }
}

export async function listExperiments(req: Request, res: Response, next: NextFunction) {
  try {
    const experiments = await experimentService.listExperiments();
    res.json(experiments);
  } catch (error) {
    next(error);
  }
}

export async function getExperiment(req: Request, res: Response, next: NextFunction) {
  try {
    const experiment = await experimentService.getExperiment(req.params.id);
    res.json(experiment);
  } catch (error) {
    next(error);
  }
}

export async function createExperiment(req: Request, res: Response, next: NextFunction) {
  try {
    const experiment = await experimentService.createExperiment({
      ...req.body,
      createdBy: req.user!.id,
    });
    await logAuditEvent({
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'experiment.create',
      resourceType: 'experiment',
      resourceId: experiment._id?.toString() || '',
      after: { name: experiment.name, feature: experiment.feature },
      requestId: (req as any).requestId,
    });
    res.status(201).json(experiment);
  } catch (error) {
    next(error);
  }
}

export async function updateExperiment(req: Request, res: Response, next: NextFunction) {
  try {
    const before = await experimentService.getExperiment(req.params.id);
    const { action } = req.body;
    let experiment;
    if (action === 'activate') {
      experiment = await experimentService.activateExperiment(req.params.id);
    } else if (action === 'rollback') {
      experiment = await experimentService.rollbackExperiment(req.params.id);
    } else {
      experiment = await experimentService.getExperiment(req.params.id);
    }
    await logAuditEvent({
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: `experiment.${action}`,
      resourceType: 'experiment',
      resourceId: req.params.id,
      before: { status: before.status },
      after: { status: experiment.status },
      requestId: (req as any).requestId,
    });
    res.json(experiment);
  } catch (error) {
    next(error);
  }
}

export async function saveFilterPreset(req: Request, res: Response, next: NextFunction) {
  try {
    const preset = await FilterPreset.create({
      userId: req.user!.id,
      name: req.body.name,
      filters: req.body.filters,
    });
    res.status(201).json(preset);
  } catch (error) {
    next(error);
  }
}

export async function listFilterPresets(req: Request, res: Response, next: NextFunction) {
  try {
    const presets = await FilterPreset.find({ userId: req.user!.id });
    res.json(presets);
  } catch (error) {
    next(error);
  }
}

export async function deleteFilterPreset(req: Request, res: Response, next: NextFunction) {
  try {
    await FilterPreset.findOneAndDelete({ _id: req.params.id, userId: req.user!.id });
    res.json({ msg: 'Preset deleted' });
  } catch (error) {
    next(error);
  }
}

// Permission Override CRUD
export async function listPermissionOverrides(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = parsePaginationParams(req.query);
    const query: any = {};
    if (req.query.dealershipId) query.dealershipId = req.query.dealershipId;
    if (req.query.resource) query.resource = req.query.resource;
    if (req.query.userId) query.userId = req.query.userId;
    if (req.query.role) query.role = req.query.role;

    const skip = (pagination.page - 1) * pagination.limit;
    const [data, total] = await Promise.all([
      PermissionOverride.find(query).sort({ createdAt: -1 }).skip(skip).limit(pagination.limit),
      PermissionOverride.countDocuments(query),
    ]);
    res.json(buildPaginatedResult(data, total, pagination));
  } catch (error) {
    next(error);
  }
}

export async function getPermissionOverride(req: Request, res: Response, next: NextFunction) {
  try {
    const override = await PermissionOverride.findById(req.params.id);
    if (!override) throw new NotFoundError('Permission override not found');
    res.json(override);
  } catch (error) {
    next(error);
  }
}

export async function createPermissionOverride(req: Request, res: Response, next: NextFunction) {
  try {
    const override = await PermissionOverride.create({
      ...req.body,
      grantedBy: req.user!.id,
    });
    await logAuditEvent({
      dealershipId: override.dealershipId?.toString(),
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'permission_override.create',
      resourceType: 'permission_override',
      resourceId: override._id?.toString() || '',
      after: {
        resource: override.resource,
        actions: override.actions,
        effect: override.effect,
        userId: override.userId,
        role: override.role,
      },
      requestId: (req as any).requestId,
    });
    res.status(201).json(override);
  } catch (error) {
    next(error);
  }
}

export async function updatePermissionOverride(req: Request, res: Response, next: NextFunction) {
  try {
    const before = await PermissionOverride.findById(req.params.id);
    if (!before) throw new NotFoundError('Permission override not found');

    const override = await PermissionOverride.findByIdAndUpdate(req.params.id, req.body, { new: true });
    await logAuditEvent({
      dealershipId: before.dealershipId?.toString(),
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'permission_override.update',
      resourceType: 'permission_override',
      resourceId: req.params.id,
      before: { actions: before.actions, effect: before.effect },
      after: override ? { actions: override.actions, effect: override.effect } : null,
      requestId: (req as any).requestId,
    });
    res.json(override);
  } catch (error) {
    next(error);
  }
}

export async function deletePermissionOverride(req: Request, res: Response, next: NextFunction) {
  try {
    const before = await PermissionOverride.findById(req.params.id);
    if (!before) throw new NotFoundError('Permission override not found');

    await PermissionOverride.findByIdAndDelete(req.params.id);
    await logAuditEvent({
      dealershipId: before.dealershipId?.toString(),
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'permission_override.delete',
      resourceType: 'permission_override',
      resourceId: req.params.id,
      before: {
        resource: before.resource,
        actions: before.actions,
        effect: before.effect,
        userId: before.userId,
        role: before.role,
      },
      requestId: (req as any).requestId,
    });
    res.json({ msg: 'Permission override deleted' });
  } catch (error) {
    next(error);
  }
}
