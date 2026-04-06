function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: requireEnv('MONGODB_URI'),
  redisUrl: requireEnv('REDIS_URL'),
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtRefreshSecret: requireEnv('JWT_REFRESH_SECRET'),
  jwtExpiresIn: '1h',
  jwtRefreshExpiresIn: '7d',
  hmacSecret: process.env.HMAC_SECRET || '',
  hmacWindowSeconds: 300,
  masterEncryptionKey: requireEnv('MASTER_ENCRYPTION_KEY'),
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  quarantineDir: process.env.QUARANTINE_DIR || './quarantine',
  maxFileSize: 10 * 1024 * 1024,
  allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  cacheTtlSeconds: 600,
  trendingUpdateIntervalMinutes: 60,
  enableOnlinePayments: process.env.ENABLE_ONLINE_PAYMENTS === 'true',
  logLevel: process.env.LOG_LEVEL || 'info',
  seed: {
    adminEmail: process.env.ADMIN_EMAIL || '',
    adminPassword: process.env.ADMIN_PASSWORD || '',
    adminFirstName: process.env.ADMIN_FIRST_NAME || 'Admin',
    adminLastName: process.env.ADMIN_LAST_NAME || 'User',
    staffEmail: process.env.STAFF_EMAIL || '',
    staffPassword: process.env.STAFF_PASSWORD || '',
    staffFirstName: process.env.STAFF_FIRST_NAME || 'Staff',
    staffLastName: process.env.STAFF_LAST_NAME || 'User',
    financeEmail: process.env.FINANCE_EMAIL || '',
    financePassword: process.env.FINANCE_PASSWORD || '',
    financeFirstName: process.env.FINANCE_FIRST_NAME || 'Finance',
    financeLastName: process.env.FINANCE_LAST_NAME || 'Reviewer',
    buyerEmail: process.env.BUYER_EMAIL || '',
    buyerPassword: process.env.BUYER_PASSWORD || '',
    buyerFirstName: process.env.BUYER_FIRST_NAME || 'Buyer',
    buyerLastName: process.env.BUYER_LAST_NAME || 'User',
  },
};

export default config;
