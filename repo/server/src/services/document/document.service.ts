import fs from 'fs';
import path from 'path';
import { DocumentModel, IDocument } from '../../models/document.model';
import { hashFile } from '../../lib/crypto';
import { validateFileType, validateFileSize } from './file-validator';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../lib/errors';
import { PaginationParams, buildPaginatedResult } from '../../lib/pagination';
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

  const doc = new DocumentModel({
    dealershipId: metadata.dealershipId,
    orderId: metadata.orderId || null,
    vehicleId: metadata.vehicleId || null,
    uploadedBy: metadata.uploadedBy,
    type: metadata.type,
    originalFilename: file.originalname,
    storagePath,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    sha256Hash,
    quarantined,
    quarantineReason,
    sensitiveFlag: metadata.sensitiveFlag || false,
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

  if (!fs.existsSync(doc.storagePath)) {
    throw new NotFoundError('Document file not found on disk');
  }

  const buffer = fs.readFileSync(doc.storagePath);
  const currentHash = hashFile(buffer);

  if (currentHash !== doc.sha256Hash) {
    doc.quarantined = true;
    doc.quarantineReason = 'Hash mismatch on download - possible tampering';
    await doc.save();
    throw new ForbiddenError('Document integrity check failed - quarantined');
  }

  return { buffer, mimeType: doc.mimeType, filename: doc.originalFilename };
}

export async function listDocuments(
  filters: { dealershipId?: string; orderId?: string; uploadedBy?: string; type?: string },
  pagination: PaginationParams
) {
  const query: any = { quarantined: false };
  if (filters.dealershipId) query.dealershipId = filters.dealershipId;
  if (filters.orderId) query.orderId = filters.orderId;
  if (filters.uploadedBy) query.uploadedBy = filters.uploadedBy;
  if (filters.type) query.type = filters.type;

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

  if (fs.existsSync(doc.storagePath)) {
    fs.unlinkSync(doc.storagePath);
  }

  await DocumentModel.findByIdAndDelete(documentId);
  logger.info({ documentId, userId }, 'Document deleted');
}
