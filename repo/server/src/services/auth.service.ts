import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User, IUser } from '../models/user.model';
import { Dealership } from '../models/dealership.model';
import config from '../config';
import { BadRequestError, UnauthorizedError, NotFoundError, ConflictError } from '../lib/errors';
import logger from '../lib/logger';
import { encryptValue, decryptValue } from './privacy/encryption.service';
import { EncryptedData } from '../lib/crypto';
import { getRedisClient } from '../config/redis';

interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: string;
  dealershipId?: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function issueSessionSigningKey(userId: string): Promise<string> {
  const signingKey = crypto.randomBytes(32).toString('hex');
  const redis = getRedisClient();
  // TTL matches access token expiry (1 hour)
  await redis.setex(`hmac:signing:${userId}`, 3600, signingKey);
  return signingKey;
}

export async function getSessionSigningKey(userId: string): Promise<string | null> {
  const redis = getRedisClient();
  return redis.get(`hmac:signing:${userId}`);
}

function generateTokens(user: IUser): TokenPair {
  const payload = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    dealershipId: user.dealershipId?.toString() || null,
  };

  const accessToken = jwt.sign(payload, config.jwtSecret, {
    expiresIn: 3600,
  });

  const refreshToken = jwt.sign(payload, config.jwtRefreshSecret, {
    expiresIn: 604800,
  });

  return { accessToken, refreshToken };
}

async function encryptSensitiveFields(user: IUser) {
  if (user.profile.driversLicense && !user.profile.driversLicenseEncrypted) {
    user.profile.driversLicenseEncrypted = await encryptValue(user.profile.driversLicense);
    user.profile.driversLicense = user.profile.driversLicense.slice(-4).padStart(user.profile.driversLicense.length, '*');
  }
  if (user.profile.ssn && !user.profile.ssnEncrypted) {
    user.profile.ssnEncrypted = await encryptValue(user.profile.ssn);
    user.profile.ssn = user.profile.ssn.slice(-4).padStart(user.profile.ssn.length, '*');
  }
}

async function decryptSensitiveFields(userJson: any): Promise<any> {
  if (userJson.profile?.driversLicenseEncrypted) {
    try {
      userJson.profile.driversLicense = await decryptValue(userJson.profile.driversLicenseEncrypted as EncryptedData);
    } catch { /* masked value remains */ }
  }
  if (userJson.profile?.ssnEncrypted) {
    try {
      userJson.profile.ssn = await decryptValue(userJson.profile.ssnEncrypted as EncryptedData);
    } catch { /* masked value remains */ }
  }
  return userJson;
}

export async function register(input: RegisterInput) {
  // Public registration always creates buyer — role escalation only via admin endpoint
  const targetDealershipId = input.dealershipId || null;
  const existing = await User.findOne({
    email: input.email,
    dealershipId: targetDealershipId,
  });
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const user = new User({
    email: input.email,
    passwordHash: input.password,
    role: 'buyer',
    dealershipId: input.dealershipId || null,
    profile: {
      firstName: input.firstName,
      lastName: input.lastName,
    },
  });

  await user.save();

  const tokens = generateTokens(user);
  user.refreshToken = tokens.refreshToken;
  await user.save();

  const signingKey = await issueSessionSigningKey(user._id.toString());

  logger.info({ userId: user._id }, 'User registered');

  return { user: user.toJSON(), ...tokens, signingKey };
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ email, isActive: true });
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const isValid = await user.comparePassword(password);
  if (!isValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const tokens = generateTokens(user);
  user.refreshToken = tokens.refreshToken;
  await user.save();

  const signingKey = await issueSessionSigningKey(user._id.toString());

  logger.info({ userId: user._id }, 'User logged in');

  return { user: user.toJSON(), ...tokens, signingKey };
}

export async function refreshTokens(refreshToken: string) {
  try {
    const decoded = jwt.verify(refreshToken, config.jwtRefreshSecret) as any;
    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== refreshToken || !user.isActive) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    const signingKey = await issueSessionSigningKey(user._id.toString());

    return { ...tokens, signingKey };
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }
}

export async function logout(userId: string) {
  await User.findByIdAndUpdate(userId, { refreshToken: null });
  const redis = getRedisClient();
  await redis.del(`hmac:signing:${userId}`);
  logger.info({ userId }, 'User logged out');
}

export async function getProfile(userId: string) {
  const user = await User.findById(userId).populate('dealershipId');
  if (!user) {
    throw new NotFoundError('User not found');
  }
  const json = user.toJSON();
  return decryptSensitiveFields(json);
}

export async function updateProfile(
  userId: string,
  updates: Partial<{ firstName: string; lastName: string; phone: string; driversLicense: string; ssn: string }>
) {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (updates.firstName) user.profile.firstName = updates.firstName;
  if (updates.lastName) user.profile.lastName = updates.lastName;
  if (updates.phone) user.profile.phone = updates.phone;
  if (updates.driversLicense) {
    user.profile.driversLicense = updates.driversLicense;
    user.profile.driversLicenseEncrypted = null as any;
  }
  if (updates.ssn) {
    user.profile.ssn = updates.ssn;
    user.profile.ssnEncrypted = null as any;
  }

  await encryptSensitiveFields(user);
  await user.save();
  const json = user.toJSON();
  return decryptSensitiveFields(json);
}
