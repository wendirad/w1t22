import { BadRequestError, TooLargeError } from '../../lib/errors';
import config from '../../config';

const MAGIC_BYTES: Record<string, Buffer> = {
  'application/pdf': Buffer.from([0x25, 0x50, 0x44, 0x46]),
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
};

export function validateFileType(buffer: Buffer, declaredMime: string): string {
  for (const [mime, magic] of Object.entries(MAGIC_BYTES)) {
    if (buffer.subarray(0, magic.length).equals(magic)) {
      if (mime !== declaredMime) {
        throw new BadRequestError(
          `File type mismatch: declared ${declaredMime} but detected ${mime}`
        );
      }
      return mime;
    }
  }
  throw new BadRequestError('Unsupported file type. Allowed: PDF, JPG, PNG');
}

export function validateFileSize(size: number): void {
  if (size > config.maxFileSize) {
    throw new TooLargeError(`File exceeds maximum size of ${config.maxFileSize / 1024 / 1024}MB`);
  }
}
