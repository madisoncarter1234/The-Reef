import type { Request, Response, NextFunction } from 'express';
import type { Address, Hex } from 'viem';
import { authService, type RequestType } from '../services/auth.js';
import { ApiError } from './error.js';
import { signedRequestSchema } from '../types/index.js';

// Extend Express Request type to include verified signer
declare global {
  namespace Express {
    interface Request {
      signer?: Address;
    }
  }
}

/**
 * Middleware factory that verifies EIP-712 signatures
 * @param requestType The type of request being verified
 * @param messageBuilder Function to extract the message from the request body
 */
export function requireAuth(
  requestType: RequestType,
  messageBuilder: (body: Record<string, unknown>) => Record<string, unknown>
) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Parse signed request fields from body
      const parsed = signedRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw ApiError.badRequest('Missing or invalid signature fields', 'INVALID_SIGNATURE_FIELDS');
      }

      const { signature, signer, nonce, deadline } = parsed.data;

      // Build the message that was signed
      const message = {
        ...messageBuilder(req.body),
        nonce,
        deadline,
      };

      // Verify signature
      const result = await authService.verifySignature(
        requestType,
        message,
        signature as Hex,
        signer as Address
      );

      if (!result.valid) {
        throw ApiError.unauthorized(result.error ?? 'Invalid signature', 'INVALID_SIGNATURE');
      }

      // Attach verified signer to request
      req.signer = result.signer;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Optional auth - extracts signer if signature present, but doesn't require it
 */
export function optionalAuth(
  requestType: RequestType,
  messageBuilder: (body: Record<string, unknown>) => Record<string, unknown>
) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = signedRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        // No signature provided, continue without auth
        return next();
      }

      const { signature, signer, nonce, deadline } = parsed.data;

      const message = {
        ...messageBuilder(req.body),
        nonce,
        deadline,
      };

      const result = await authService.verifySignature(
        requestType,
        message,
        signature as Hex,
        signer as Address
      );

      if (result.valid) {
        req.signer = result.signer;
      }

      next();
    } catch (error) {
      // Ignore auth errors for optional auth
      next();
    }
  };
}

/**
 * Simple rate limiting by IP (in-memory, for basic protection)
 * For production, use Redis-based rate limiting
 */
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // requests per window
const RATE_WINDOW = 60000; // 1 minute

export function rateLimit(limit = RATE_LIMIT, windowMs = RATE_WINDOW) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();

    let record = requestCounts.get(ip);
    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
      requestCounts.set(ip, record);
    }

    record.count++;

    if (record.count > limit) {
      throw ApiError.badRequest('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED');
    }

    next();
  };
}

// Cleanup old rate limit records periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of requestCounts.entries()) {
    if (now > record.resetAt) {
      requestCounts.delete(ip);
    }
  }
}, 60000);
