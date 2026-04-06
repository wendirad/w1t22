import pino from 'pino';

const SENSITIVE_PATTERNS = [
  'ssn', 'driversLicense', 'driversLicenseEncrypted', 'ssnEncrypted',
  'password', 'passwordHash', 'refreshToken', 'accessToken',
  'creditCard', 'cardNumber',
  'bankAccount', 'routingNumber', 'taxId',
  'masterEncryptionKey', 'hmacSecret', 'jwtSecret', 'jwtRefreshSecret',
];

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  redact: {
    paths: SENSITIVE_PATTERNS.flatMap((field) => [
      field,
      `*.${field}`,
      `*.*.${field}`,
      `*.profile.${field}`,
    ]),
    censor: '[REDACTED]',
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_PATTERNS.some((p) => {
    const pl = p.toLowerCase();
    // Exact match or camelCase boundary match (e.g., "ssnEncrypted" matches "ssn")
    // but "businessName" should NOT match "ssn"
    if (lower === pl) return true;
    // Check if the pattern appears as a word boundary in camelCase
    // e.g., "ssnEncrypted" starts with "ssn", "driversLicenseEncrypted" contains "driversLicense"
    const idx = lower.indexOf(pl);
    if (idx === -1) return false;
    // Must be at start of string or preceded by a lowercase letter followed by uppercase
    const beforeOk = idx === 0 || /[a-z]$/.test(lower.slice(0, idx)) === false;
    // Must end at string boundary or followed by uppercase (camelCase boundary)
    const afterIdx = idx + pl.length;
    const afterOk = afterIdx >= lower.length || /^[A-Z]/.test(key.slice(afterIdx));
    return beforeOk && afterOk;
  });
}

export function sanitizeForAudit(data: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!data) return null;
  const sanitized = { ...data };
  for (const key of Object.keys(sanitized)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (sanitized[key] && typeof sanitized[key] === 'object' && !Array.isArray(sanitized[key])) {
      sanitized[key] = sanitizeForAudit(sanitized[key]);
    }
  }
  return sanitized;
}
