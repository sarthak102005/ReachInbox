// ─── API Response Types ───────────────────────────────────────────────────────

export interface User {
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface Sender {
  id: string;
  emailAddress: string;
  displayName: string;
  createdAt: string;
}

export type EmailJobStatus = 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED' | 'RESCHEDULED';

export interface EmailJob {
  id: string;
  recipientEmail: string;
  subject: string;
  scheduledFor?: string;
  sentAt?: string | null;
  status: EmailJobStatus;
  attempts: number;
  lastError?: string | null;
  createdAt?: string;
  updatedAt?: string;
  sender?: {
    emailAddress: string;
    displayName: string;
  };
}

export interface PaginatedJobs {
  jobs: EmailJob[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ScheduleEmailPayload {
  subject: string;
  body: string;
  recipients: string[];
  senderId: string;
  startTime: string; // ISO date string
  delaySeconds?: number;
  hourlyLimit?: number;
}

export interface ScheduleEmailResponse {
  scheduled: number;
  invalid: string[];
  jobs: Array<{ id: string; recipientEmail: string }>;
}

export interface SlackStatus {
  connected: boolean;
  teamName: string | null;
}

export interface SearchEmailsParams {
  q?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface SearchEmailsResult {
  hits: EmailJob[];
  total: number;
  page: number;
  limit: number;
}
