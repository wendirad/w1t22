import { Types } from 'mongoose';
import { Role } from './enums';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: {
        id: string;
        email: string;
        role: Role;
        dealershipId: string | null;
      };
      scope?: {
        dealershipId: string;
      };
    }
  }
}

export {};
