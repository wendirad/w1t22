import { Request, Response, NextFunction } from 'express';
import * as consentService from '../services/privacy/consent.service';
import * as exportService from '../services/privacy/data-export.service';
import * as deletionService from '../services/privacy/account-deletion.service';

export async function getConsentHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const consents = await consentService.getConsentHistory(req.user!.id);
    res.json(consents);
  } catch (error) {
    next(error);
  }
}

export async function recordConsent(req: Request, res: Response, next: NextFunction) {
  try {
    const consent = await consentService.recordConsent({
      userId: req.user!.id,
      consentType: req.body.consentType,
      granted: req.body.granted,
      version: req.body.version,
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
    });
    res.status(201).json(consent);
  } catch (error) {
    next(error);
  }
}

export async function exportData(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await exportService.exportUserData(req.user!.id);
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function requestDeletion(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await deletionService.requestAccountDeletion(req.user!.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
