const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/motorlot',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-jwt-refresh-secret',
  jwtExpiresIn: '1h',
  jwtRefreshExpiresIn: '7d',
  hmacSecret: process.env.HMAC_SECRET || 'dev-hmac-secret',
  hmacWindowSeconds: 300,
  masterEncryptionKey: process.env.MASTER_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  quarantineDir: process.env.QUARANTINE_DIR || './quarantine',
  maxFileSize: 10 * 1024 * 1024,
  allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  cacheTtlSeconds: 600,
  trendingUpdateIntervalMinutes: 60,
  logLevel: process.env.LOG_LEVEL || 'info',
};

export default config;
