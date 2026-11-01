import { randomBytes } from 'node:crypto';

/** 32-byte cryptographically random token, hex-encoded (64 chars). */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}
