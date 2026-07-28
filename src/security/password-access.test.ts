import { describe, expect, it } from 'vitest';
import { LoginRateLimiter, PasswordAccess } from './password-access.js';

describe('PasswordAccess', () => {
  it('issues expiring signed sessions and rejects tampering or password rotation', () => {
    const now = Date.UTC(2026, 6, 29, 0, 0, 0);
    const access = new PasswordAccess('correct-horse-battery-staple', 'a-session-secret-that-is-long-and-random', true, 60);
    const token = access.issueSession(now);

    expect(access.verifyPassword('correct-horse-battery-staple')).toBe(true);
    expect(access.verifyPassword('wrong')).toBe(false);
    expect(access.verifySession(token, now + 30_000)).toBe(true);
    expect(access.verifySession(`${token}x`, now + 30_000)).toBe(false);
    expect(access.verifySession(token, now + 60_000)).toBe(false);
    expect(new PasswordAccess('rotated-password-value', 'a-session-secret-that-is-long-and-random', true, 60)
      .verifySession(token, now + 30_000)).toBe(false);
  });

  it('uses host-only secure cookies and parses only the exact cookie name', () => {
    const access = new PasswordAccess('correct-horse-battery-staple', 'a-session-secret-that-is-long-and-random', true);
    const token = access.issueSession();
    expect(access.sessionCookie(token)).toContain('__Host-praxis_session=');
    expect(access.sessionCookie(token)).toContain('HttpOnly; SameSite=Strict;');
    expect(access.sessionCookie(token)).toContain('; Secure');
    expect(access.readSessionCookie(`unrelated=1; __Host-praxis_session=${token}`)).toBe(token);
    expect(access.expiredCookie()).toContain('Max-Age=0');
  });
});

describe('LoginRateLimiter', () => {
  it('temporarily blocks repeated failures and resets after successful authentication', () => {
    const limiter = new LoginRateLimiter(2, 10_000, 5_000);
    limiter.recordFailure('client', 1_000);
    expect(limiter.retryAfterSeconds('client', 1_000)).toBe(0);
    limiter.recordFailure('client', 2_000);
    expect(limiter.retryAfterSeconds('client', 2_001)).toBe(5);
    expect(limiter.retryAfterSeconds('client', 7_000)).toBe(0);
    limiter.reset('client');
    expect(limiter.retryAfterSeconds('client', 2_001)).toBe(0);
  });
});
