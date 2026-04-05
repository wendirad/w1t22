import { Consent } from '../../models/consent.model';

export async function recordConsent(params: {
  userId: string;
  consentType: string;
  granted: boolean;
  version: string;
  ipAddress: string;
  userAgent: string;
}) {
  return Consent.create(params);
}

export async function getConsentHistory(userId: string) {
  return Consent.find({ userId }).sort({ timestamp: -1 });
}

export async function getLatestConsent(userId: string, consentType: string) {
  return Consent.findOne({ userId, consentType }).sort({ timestamp: -1 });
}
