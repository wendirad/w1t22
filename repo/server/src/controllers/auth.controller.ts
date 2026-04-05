import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import { logAuditEvent } from '../services/audit.service';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.body);
    await logAuditEvent({
      userId: result.user._id?.toString() || '',
      role: result.user.role || 'buyer',
      ip: req.ip || '',
      action: 'user.register',
      resourceType: 'user',
      resourceId: result.user._id?.toString() || '',
      after: { email: result.user.email, role: result.user.role },
      requestId: (req as any).requestId,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    await logAuditEvent({
      userId: result.user._id?.toString() || '',
      role: result.user.role || '',
      ip: req.ip || '',
      action: 'user.login',
      resourceType: 'user',
      resourceId: result.user._id?.toString() || '',
      requestId: (req as any).requestId,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function refreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshTokens(refreshToken);
    res.json(tokens);
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.logout(req.user!.id);
    await logAuditEvent({
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'user.logout',
      resourceType: 'user',
      resourceId: req.user!.id,
      requestId: (req as any).requestId,
    });
    res.json({ msg: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.getProfile(req.user!.id);
    res.json(user);
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const before = await authService.getProfile(req.user!.id);
    const user = await authService.updateProfile(req.user!.id, req.body);
    await logAuditEvent({
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'user.update_profile',
      resourceType: 'user',
      resourceId: req.user!.id,
      before: { profile: before.profile },
      after: { profile: user.profile },
      requestId: (req as any).requestId,
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
}
