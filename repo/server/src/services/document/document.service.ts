import fs from 'fs';
import path from 'path';
import { DocumentModel, IDocument } from '../../models/document.model';
import { hashFile } from '../../lib/crypto';
import { validateFileType, validateFileSize } from './file-validator';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../lib/errors';
import { PaginationParams, buildPaginatedResult } from '../../lib/pagination';
import { encryptValue, decryptValue } from '../privacy/encryption.service';
import config from '../../config';
import logger from '../../lib/logger';

export async function uploadDocument(
  file: Express.Multer.File,
  metadata: {
    dealershipId: string;
    uploadedBy: string;
    type: string;
    orderId?: string;
    vehicleId?: string;
    sensitiveFlag?: boolean;
  }
) {
  validateFileSize(file.size);

  let quarantined = false;
  let quarantineReason: string | null = null;

  try {
    validateFileType(file.buffer, file.mimetype);
  } catch (error: any) {
    quarantined = true;
    quarantineReason = error.message;
  }

  const sha256Hash = hashFile(file.buffer);
  const date = new Date();
  const subDir = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

  let storagePath: string;
  if (quarantined) {
    const quarantineDir = path.join(config.quarantineDir, metadata.dealershipId);
    fs.mkdirSync(quarantineDir, { recursive: true });
    storagePath = path.join(quarantineDir, `${sha256Hash}-${file.originalname}`);
  } else {
    const uploadDir = path.join(config.uploadDir, metadata.dealershipId, subDir);
    fs.mkdirSync(uploadDir, { recursive: true });
    storagePath = path.join(uploadDir, `${sha256Hash}-${file.originalname}`);
  }

  fs.writeFileSync(storagePath, file.buffer);

  // For sensitive documents, encrypt metadata before persistence so that
  // plaintext never reaches the database. Only non-sensitive fields (type, hash,
  // size, mimeType) are stored in raw form for indexing.
  let persistedFilename = file.originalname;
  let persistedStoragePath = storagePath;
  let encryptedMetadata = null;

  if (metadata.sensitiveFlag) {
    encryptedMetadata = {
      originalFilename: await encryptValue(file.originalname),
      storagePath: await encryptValue(storagePath),
    };
    // Replace plaintext with opaque placeholders — the real values are only
    // in encryptedMetadata and can be decrypted on authorized read
    persistedFilename = `[ENCRYPTED:${sha256Hash.slice(0, 8)}]`;
    persistedStoragePath = `[ENCRYPTED:${sha256Hash.slice(0, 8)}]`;
  }

  const doc = new DocumentModel({
    dealershipId: metadata.dealershipId,
    orderId: metadata.orderId || null,
    vehicleId: metadata.vehicleId || null,
    uploadedBy: metadata.uploadedBy,
    type: metadata.type,
    originalFilename: persistedFilename,
    storagePath: persistedStoragePath,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    sha256Hash,
    quarantined,
    quarantineReason,
    sensitiveFlag: metadata.sensitiveFlag || false,
    encryptedMetadata,
  });

  await doc.save();

  logger.info(
    { documentId: doc._id, quarantined, filename: file.originalname },
    'Document uploaded'
  );

  return doc;
}

export async function getDocument(documentId: string) {
  const doc = await DocumentModel.findById(documentId);
  if (!doc) throw new NotFoundError('Document not found');
  return doc;
}

export async function downloadDocument(documentId: string) {
  const doc = await DocumentModel.findById(documentId);
  if (!doc) throw new NotFoundError('Document not found');
  if (doc.quarantined) throw new ForbiddenError('Document is quarantined');

  // For sensitive documents, decrypt the real storage path and filename
  let actualStoragePath = doc.storagePath;
  let actualFilename = doc.originalFilename;

  if (doc.sensitiveFlag && doc.encryptedMetadata) {
    try {
      if (doc.encryptedMetadata.storagePath) {
        actualStoragePath = await decryptValue(doc.encryptedMetadata.storagePath);
      }
      if (doc.encryptedMetadata.originalFilename) {
        actualFilename = await decryptValue(doc.encryptedMetadata.originalFilename);
      }
    } catch (err: any) {
      logger.error({ documentId, error: err.message }, 'Failed to decrypt sensitive document metadata');
      throw new ForbiddenError('Unable to access sensitive document');
    }
  }

  if (!fs.existsSync(actualStoragePath)) {
    throw new NotFoundError('Document file not found on disk');
  }

  const buffer = fs.readFileSync(actualStoragePath);
  const currentHash = hashFile(buffer);

  if (currentHash !== doc.sha256Hash) {
    doc.quarantined = true;
    doc.quarantineReason = 'Hash mismatch on download - possible tampering';
    await doc.save();
    throw new ForbiddenError('Document integrity check failed - quarantined');
  }

  return { buffer, mimeType: doc.mimeType, filename: actualFilename };
}

export async function listDocuments(
  filters: { dealershipId?: string; orderId?: string; uploadedBy?: string; type?: string; sensitiveFlag?: boolean },
  pagination: PaginationParams
) {
  const query: any = { quarantined: false };
  if (filters.dealershipId) query.dealershipId = filters.dealershipId;
  if (filters.orderId) query.orderId = filters.orderId;
  if (filters.uploadedBy) query.uploadedBy = filters.uploadedBy;
  if (filters.type) query.type = filters.type;
  if (filters.sensitiveFlag !== undefined) query.sensitiveFlag = filters.sensitiveFlag;

  const sort: any = { [pagination.sortBy]: pagination.sortOrder === 'asc' ? 1 : -1 };
  const skip = (pagination.page - 1) * pagination.limit;

  const [data, total] = await Promise.all([
    DocumentModel.find(query).sort(sort).skip(skip).limit(pagination.limit),
    DocumentModel.countDocuments(query),
  ]);

  return buildPaginatedResult(data, total, pagination);
}

export async function deleteDocument(documentId: string, userId: string) {
  const doc = await DocumentModel.findById(documentId);
  if (!doc) throw new NotFoundError('Document not found');

  // For sensitive documents, decrypt the real storage path
  let actualStoragePath = doc.storagePath;
  if (doc.sensitiveFlag && doc.encryptedMetadata?.storagePath) {
    try {
      actualStoragePath = await decryptValue(doc.encryptedMetadata.storagePath);
    } catch { /* use stored path as fallback */ }
  }

  if (fs.existsSync(actualStoragePath)) {
    fs.unlinkSync(actualStoragePath);
  }

  await DocumentModel.findByIdAndDelete(documentId);
  logger.info({ documentId, userId }, 'Document deleted');
}

export async function updateDocumentMetadata(
  documentId: string,
  updates: { type?: string; orderId?: string; vehicleId?: string; sensitiveFlag?: boolean }
) {
  const doc = await DocumentModel.findById(documentId);
  if (!doc) throw new NotFoundError('Document not found');

  if (updates.type !== undefined) doc.type = updates.type as any;
  if (updates.orderId !== undefined) doc.orderId = updates.orderId as any;
  if (updates.vehicleId !== undefined) doc.vehicleId = updates.vehicleId as any;
  if (updates.sensitiveFlag !== undefined) doc.sensitiveFlag = updates.sensitiveFlag;

  await doc.save();
  logger.info({ documentId }, 'Document metadata updated');
  return doc;
}

export async function shareDocument(
  documentId: string,
  shareParams: { targetUserId: string; actions: string[] }
) {
  const doc = await DocumentModel.findById(documentId);
  if (!doc) throw new NotFoundError('Document not found');

  const existing = doc.permissions.overrides.find(
    (o) => o.userId.toString() === shareParams.targetUserId
  );

  if (existing) {
    existing.actions = [...new Set([...existing.actions, ...shareParams.actions])];
  } else {
    doc.permissions.overrides.push({
      userId: shareParams.targetUserId as any,
      actions: shareParams.actions,
    });
  }

  await doc.save();
  logger.info({ documentId, targetUserId: shareParams.targetUserId }, 'Document shared');
  return doc;
}

export async function transitionDocumentStatus(
  documentId: string,
  status: string,
  userId: string
) {
  const doc = await DocumentModel.findById(documentId);
  if (!doc) throw new NotFoundError('Document not found');

  if (doc.quarantined) throw new ForbiddenError('Cannot transition quarantined document');

  doc.status = status;
  await doc.save();
  logger.info({ documentId, status, userId }, 'Document status transitioned');
  return doc;
}
