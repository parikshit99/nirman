import type {
  ApiError as ApiErrorBody,
  AuthResponse,
  ExtractionRequest,
  ExtractionResponse,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
} from '@nirman/shared';
import { sessionStore, type Session } from './session.ts';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
/** The server could not be reached (offline, DNS, timeout). */
export class NetworkError extends Error {}
/** The refresh token was rejected; the user has to sign in again. */
export class SessionExpiredError extends Error {}

const DEFAULT_TIMEOUT_MS = 30_000;
const EXTRACTION_TIMEOUT_MS = 90_000;

type Listener = (session: Session | null) => void;

export class ApiClient {
  private session: Session | null = null;
  private refreshing: Promise<void> | null = null;
  private listeners = new Set<Listener>();

  constructor(private store: Pick<typeof sessionStore, 'get' | 'set' | 'clear'> = sessionStore) {}

  async init(): Promise<Session | null> {
    this.session = await this.store.get();
    return this.session;
  }

  get current(): Session | null {
    return this.session;
  }

  onSessionChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private async setSession(session: Session | null) {
    this.session = session;
    if (session) await this.store.set(session);
    else await this.store.clear();
    for (const fn of this.listeners) fn(session);
  }

  private async fetchJson<T>(serverUrl: string, path: string, init: RequestInit & { timeoutMs?: number }): Promise<T> {
    let res: Response;
    try {
      res = await fetch(serverUrl.replace(/\/+$/, '') + path, {
        ...init,
        headers: { 'content-type': 'application/json', ...init.headers },
        signal: AbortSignal.timeout(init.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (err) {
      throw new NetworkError((err as Error).message || 'Network request failed');
    }
    if (res.status === 204) return undefined as T;
    const body = (await res.json().catch(() => null)) as T | ApiErrorBody | null;
    if (!res.ok) {
      const e = body as ApiErrorBody | null;
      throw new ApiError(res.status, e?.error ?? 'http_error', e?.message ?? `Request failed (${res.status})`);
    }
    return body as T;
  }

  /** Check credentials and return a session without switching to it yet. */
  async requestSession(mode: 'login' | 'register', serverUrl: string, email: string, password: string): Promise<Session> {
    const url = serverUrl.trim().replace(/\/+$/, '');
    const res = await this.fetchJson<AuthResponse>(url, `/auth/${mode}`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return { server_url: url, ...res };
  }

  /** Make `session` the active one (persisted, and listeners notified). */
  adopt(session: Session): Promise<void> {
    return this.setSession(session);
  }

  /** Sign in (or register) and keep the session. */
  async authenticate(mode: 'login' | 'register', serverUrl: string, email: string, password: string): Promise<Session> {
    const session = await this.requestSession(mode, serverUrl, email, password);
    await this.setSession(session);
    return session;
  }

  /** Revoke a session's refresh token on the server (best effort). */
  async revoke(session: Session): Promise<void> {
    await this.fetchJson(session.server_url, '/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    }).catch(() => {});
  }

  async signOut(): Promise<void> {
    const s = this.session;
    await this.setSession(null);
    if (s) await this.revoke(s);
  }

  private refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      const s = this.session;
      if (!s) throw new SessionExpiredError('Not signed in');
      try {
        const res = await this.fetchJson<AuthResponse>(s.server_url, '/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: s.refresh_token }),
        });
        await this.setSession({ ...s, ...res });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await this.setSession(null);
          throw new SessionExpiredError(err.message);
        }
        throw err;
      }
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** Authenticated request; refreshes the access token once on 401. */
  private async authed<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
    if (!this.session) throw new SessionExpiredError('Not signed in');
    const call = () =>
      this.fetchJson<T>(this.session!.server_url, path, {
        ...init,
        headers: { authorization: `Bearer ${this.session!.access_token}` },
      });
    try {
      return await call();
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err;
      await this.refresh();
      return call();
    }
  }

  push(changes: SyncPushRequest['changes']) {
    return this.authed<SyncPushResponse>('/sync/push', { method: 'POST', body: JSON.stringify({ changes }) });
  }

  pull(since: string) {
    return this.authed<SyncPullResponse>(`/sync/pull?since=${encodeURIComponent(since)}`, { method: 'GET' });
  }

  extract(req: ExtractionRequest) {
    return this.authed<ExtractionResponse>('/extractions', {
      method: 'POST',
      body: JSON.stringify(req),
      timeoutMs: EXTRACTION_TIMEOUT_MS,
    });
  }
}
