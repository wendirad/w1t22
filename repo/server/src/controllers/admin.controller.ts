import { Request, Response, NextFunction } from 'express';
import { Synonym } from '../models/synonym.model';
import { TaxRate } from '../models/tax-rate.model';
import { User } from '../models/user.model';
import { Dealership } from '../models/dealership.model';
import { FilterPreset } from '../models/filter-preset.model';
import * as experimentService from '../services/experiment.service';
import { clearSynonymCache } from '../services/search/synonym.service';

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
    res.status(201).json(synonym);
  } catch (error) {
    next(error);
  }
}

export async function updateSynonym(req: Request, res: Response, next: NextFunction) {
  try {
    const synonym = await Synonym.findByIdAndUpdate(req.params.id, req.body, { new: true });
    clearSynonymCache();
    res.json(synonym);
  } catch (error) {
    next(error);
  }
}

export async function deleteSynonym(req: Request, res: Response, next: NextFunction) {
  try {
    await Synonym.findByIdAndDelete(req.params.id);
    clearSynonymCache();
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
    res.status(201).json(rate);
  } catch (error) {
    next(error);
  }
}

export async function updateTaxRate(req: Request, res: Response, next: NextFunction) {
  try {
    const rate = await TaxRate.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(rate);
  } catch (error) {
    next(error);
  }
}

export async function deleteTaxRate(req: Request, res: Response, next: NextFunction) {
  try {
    await TaxRate.findByIdAndDelete(req.params.id);
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
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: req.body.role, dealershipId: req.body.dealershipId },
      { new: true }
    ).select('-passwordHash -refreshToken');
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
    res.status(201).json(experiment);
  } catch (error) {
    next(error);
  }
}

export async function updateExperiment(req: Request, res: Response, next: NextFunction) {
  try {
    const { action } = req.body;
    let experiment;
    if (action === 'activate') {
      experiment = await experimentService.activateExperiment(req.params.id);
    } else if (action === 'rollback') {
      experiment = await experimentService.rollbackExperiment(req.params.id);
    } else {
      experiment = await experimentService.getExperiment(req.params.id);
    }
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
