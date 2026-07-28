import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_VERSION = 'v1';
const DEFAULT_SESSION_SECONDS = 12 * 60 * 60;

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export class PasswordAccess {
  readonly cookieName: string;
  private readonly passwordDigest: Buffer;
  private readonly signingKey: Buffer;

  constructor(
    password: string,
    sessionSecret: string,
    private readonly secureCookie: boolean,
    private readonly sessionSeconds = DEFAULT_SESSION_SECONDS,
  ) {
    this.cookieName = secureCookie ? '__Host-praxis_session' : 'praxis_session';
    this.passwordDigest = digest(password);
    this.signingKey = createHash('sha256')
      .update(sessionSecret, 'utf8')
      .update('\0')
      .update(password, 'utf8')
      .digest();
  }

  verifyPassword(candidate: unknown): boolean {
    if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > 1024) return false;
    return timingSafeEqual(this.passwordDigest, digest(candidate));
  }

  issueSession(now = Date.now()): string {
    const expiresAt = Math.floor(now / 1000) + this.sessionSeconds;
    const payload = `${SESSION_VERSION}.${expiresAt}`;
    return `${payload}.${this.sign(payload)}`;
  }

  verifySession(token: string | undefined, now = Date.now()): boolean {
    if (!token || token.length > 512) return false;
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== SESSION_VERSION || !/^\d+$/.test(parts[1] ?? '')) return false;
    const expiresAt = Number(parts[1]);
    const nowSeconds = Math.floor(now / 1000);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds || expiresAt > nowSeconds + this.sessionSeconds) return false;
    const supplied = Buffer.from(parts[2] ?? '', 'utf8');
    const expected = Buffer.from(this.sign(`${parts[0]}.${parts[1]}`), 'utf8');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  readSessionCookie(cookieHeader: string | undefined): string | undefined {
    if (!cookieHeader) return undefined;
    for (const item of cookieHeader.split(';')) {
      const separator = item.indexOf('=');
      if (separator < 1) continue;
      if (item.slice(0, separator).trim() === this.cookieName) return item.slice(separator + 1).trim();
    }
    return undefined;
  }

  sessionCookie(token: string): string {
    return this.serializeCookie(token, `Max-Age=${this.sessionSeconds}`);
  }

  expiredCookie(): string {
    return this.serializeCookie('', 'Max-Age=0');
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.signingKey).update(payload, 'utf8').digest('base64url');
  }

  private serializeCookie(value: string, lifetime: string): string {
    const secure = this.secureCookie ? '; Secure' : '';
    return `${this.cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; ${lifetime}${secure}`;
  }
}

type FailureState = { count: number; windowStartedAt: number; blockedUntil: number };

export class LoginRateLimiter {
  private readonly failures = new Map<string, FailureState>();
  private readonly maximumTrackedClients = 2048;

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMilliseconds = 10 * 60 * 1000,
    private readonly blockMilliseconds = 60 * 1000,
  ) {}

  retryAfterSeconds(key: string, now = Date.now()): number {
    const state = this.failures.get(key);
    if (!state || state.blockedUntil <= now) return 0;
    return Math.ceil((state.blockedUntil - now) / 1000);
  }

  recordFailure(key: string, now = Date.now()): void {
    this.prune(now);
    const current = this.failures.get(key);
    const state = !current || now - current.windowStartedAt >= this.windowMilliseconds
      ? { count: 0, windowStartedAt: now, blockedUntil: 0 }
      : current;
    state.count += 1;
    if (state.count >= this.maxFailures) state.blockedUntil = now + this.blockMilliseconds;
    this.failures.set(key, state);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  private prune(now: number): void {
    if (this.failures.size < this.maximumTrackedClients) return;
    for (const [key, state] of this.failures) {
      if (now - state.windowStartedAt >= this.windowMilliseconds && state.blockedUntil <= now) {
        this.failures.delete(key);
      }
    }
    while (this.failures.size >= this.maximumTrackedClients) {
      const oldest = this.failures.keys().next().value as string | undefined;
      if (!oldest) break;
      this.failures.delete(oldest);
    }
  }
}
