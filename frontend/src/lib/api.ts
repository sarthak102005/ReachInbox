import type {
  User,
  Sender,
  PaginatedJobs,
  ScheduleEmailPayload,
  ScheduleEmailResponse,
  SlackStatus,
  SearchEmailsParams,
  SearchEmailsResult,
} from './types';

const API_BASE = '/api'; // Proxied by Next.js rewrites to localhost:4000

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let message = `Request failed: ${res.status} ${res.statusText}`;
    let body: any = null;
    try {
      body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    const err: any = new Error(message);
    if (body) {
      err.data = body;
      err.invalid = body.invalid;
    }
    throw err;
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    me(): Promise<{ user: User }> {
      return apiFetch('/auth/me');
    },
    logout(): Promise<{ success: boolean }> {
      return apiFetch('/auth/logout', { method: 'POST' });
    },
    googleLoginUrl: '/api/auth/google', // Full URL handled by Next.js proxy
  },

  // ─── Senders ────────────────────────────────────────────────────────────────

  senders: {
    list(): Promise<{ senders: Sender[] }> {
      return apiFetch('/senders');
    },
    create(data: { displayName: string; emailAddress?: string }): Promise<{ sender: Sender }> {
      return apiFetch('/senders', { method: 'POST', body: JSON.stringify(data) });
    },
  },

  // ─── Emails ─────────────────────────────────────────────────────────────────

  emails: {
    schedule(payload: ScheduleEmailPayload): Promise<ScheduleEmailResponse> {
      return apiFetch('/emails/schedule', { method: 'POST', body: JSON.stringify(payload) });
    },

    scheduled(page = 1, limit = 20): Promise<PaginatedJobs> {
      return apiFetch(`/emails/scheduled?page=${page}&limit=${limit}`);
    },

    sent(page = 1, limit = 20): Promise<PaginatedJobs> {
      return apiFetch(`/emails/sent?page=${page}&limit=${limit}`);
    },

    search(params: SearchEmailsParams): Promise<SearchEmailsResult> {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.status) qs.set('status', params.status);
      if (params.page) qs.set('page', String(params.page));
      if (params.limit) qs.set('limit', String(params.limit));
      return apiFetch(`/emails/search?${qs}`);
    },
  },

  // ─── Slack ──────────────────────────────────────────────────────────────────

  slack: {
    status(): Promise<SlackStatus> {
      return apiFetch('/slack/status');
    },
    connectUrl: '/api/slack/connect',
    disconnect(): Promise<{ success: boolean }> {
      return apiFetch('/slack/disconnect', { method: 'DELETE' });
    },
  },
};
