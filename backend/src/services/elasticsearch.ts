import { esClient, EMAIL_INDEX } from '../config/elasticsearch';
import { prisma } from '../config/prisma';

export interface EmailDocument {
  id: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: string;
  scheduledFor: Date | string;
  sentAt?: Date | string | null;
  senderId: string;
  userId: string;
}

/**
 * Upserts an EmailJob document into Elasticsearch.
 * Called on every status transition: SCHEDULED → SENDING → SENT/FAILED/RESCHEDULED.
 * Safe to call even if ES is offline or disabled.
 */
export async function upsertEmailJob(doc: EmailDocument): Promise<void> {
  if (!esClient) return;

  try {
    await esClient.index({
      index: EMAIL_INDEX,
      id: doc.id,
      document: {
        recipientEmail: doc.recipientEmail,
        subject: doc.subject,
        body: doc.body,
        status: doc.status,
        scheduledFor: doc.scheduledFor instanceof Date ? doc.scheduledFor.toISOString() : doc.scheduledFor,
        sentAt: doc.sentAt instanceof Date ? doc.sentAt.toISOString() : (doc.sentAt ?? null),
        senderId: doc.senderId,
        userId: doc.userId,
      },
    });
  } catch (err: any) {
    // Non-fatal: log and continue. ES outage/absence must never break email delivery.
    console.warn(`[ES] Failed to upsert document ${doc.id} (${err.message}). Continuing.`);
  }
}

export interface SearchEmailsParams {
  q?: string;
  status?: string;
  userId: string;
  page?: number;
  limit?: number;
}

export interface SearchEmailsResult {
  hits: EmailDocument[];
  total: number;
}

/**
 * Fallback search executed against PostgreSQL using Prisma `contains` with insensitive mode.
 * Automatically used when Elasticsearch is disabled, unreachable, or throws any error.
 */
async function searchWithPrismaFallback(params: SearchEmailsParams): Promise<SearchEmailsResult> {
  const { q, status, userId, page = 1, limit = 20 } = params;

  const where: any = {
    userId,
    ...(status ? { status } : {}),
  };

  if (q && q.trim()) {
    const term = q.trim();
    where.OR = [
      { subject: { contains: term, mode: 'insensitive' } },
      { body: { contains: term, mode: 'insensitive' } },
      { recipientEmail: { contains: term, mode: 'insensitive' } },
    ];
  }

  try {
    const [jobs, total] = await prisma.$transaction([
      prisma.emailJob.findMany({
        where,
        orderBy: { scheduledFor: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.emailJob.count({ where }),
    ]);

    const hits: EmailDocument[] = jobs.map((job) => ({
      id: job.id,
      recipientEmail: job.recipientEmail,
      subject: job.subject,
      body: job.body,
      status: job.status,
      scheduledFor: job.scheduledFor,
      sentAt: job.sentAt,
      senderId: job.senderId,
      userId: job.userId,
    }));

    return { hits, total };
  } catch (dbErr: any) {
    console.error('[Search] Fallback query to PostgreSQL failed:', dbErr.message);
    return { hits: [], total: 0 };
  }
}

/**
 * Full-text search over emails.
 * Uses Elasticsearch when available; falls back to PostgreSQL contains queries on ANY error.
 */
export async function searchEmails(params: SearchEmailsParams): Promise<SearchEmailsResult> {
  if (!esClient) {
    return searchWithPrismaFallback(params);
  }

  const { q, status, userId, page = 1, limit = 20 } = params;
  const from = (page - 1) * limit;

  const must: object[] = [];
  const filter: object[] = [{ term: { userId } }];

  if (q && q.trim()) {
    must.push({
      multi_match: {
        query: q.trim(),
        fields: ['subject^2', 'body', 'recipientEmail^1.5'],
        fuzziness: 'AUTO',
      },
    });
  } else {
    must.push({ match_all: {} });
  }

  if (status && status.trim()) {
    filter.push({ term: { status: status.trim() } });
  }

  try {
    const response = await esClient.search({
      index: EMAIL_INDEX,
      from,
      size: limit,
      query: {
        bool: { must, filter },
      },
      sort: [{ scheduledFor: { order: 'desc' } }],
    });

    const total = typeof response.hits.total === 'number'
      ? response.hits.total
      : (response.hits.total?.value ?? 0);

    const hits = response.hits.hits
      .filter((hit) => hit._id !== undefined)
      .map((hit) => ({
        id: hit._id as string,
        ...(hit._source as Omit<EmailDocument, 'id'>),
      }));

    return { hits, total };
  } catch (err: any) {
    console.warn(`[ES] Search query failed (${err.message}) — falling back to PostgreSQL search.`);
    return searchWithPrismaFallback(params);
  }
}
