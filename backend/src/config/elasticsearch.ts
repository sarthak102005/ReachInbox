import { Client } from '@elastic/elasticsearch';
import { env } from './env';

const isEsEnabled =
  Boolean(env.ELASTICSEARCH_URL) &&
  env.ELASTICSEARCH_URL !== 'disabled' &&
  env.ELASTICSEARCH_URL !== 'false' &&
  env.ELASTICSEARCH_URL !== '';

export const esClient: Client | null = isEsEnabled
  ? new Client({
      node: env.ELASTICSEARCH_URL,
      requestTimeout: 2000,
      maxRetries: 0,
    })
  : null;

export const EMAIL_INDEX = 'emails';

export async function ensureEmailIndex(): Promise<void> {
  if (!esClient) {
    console.log('[ES] Elasticsearch disabled or omitted — using PostgreSQL search fallback.');
    return;
  }

  try {
    const exists = await esClient.indices.exists({ index: EMAIL_INDEX });
    if (!exists) {
      await esClient.indices.create({
        index: EMAIL_INDEX,
        mappings: {
          properties: {
            recipientEmail: { type: 'text', analyzer: 'standard' },
            subject:        { type: 'text', analyzer: 'standard' },
            body:           { type: 'text', analyzer: 'standard' },
            status:         { type: 'keyword' },
            scheduledFor:   { type: 'date' },
            sentAt:         { type: 'date' },
            senderId:       { type: 'keyword' },
            userId:         { type: 'keyword' },
          },
        },
      });
      console.log(`[ES] Created index: ${EMAIL_INDEX}`);
    } else {
      console.log(`[ES] Index already exists: ${EMAIL_INDEX}`);
    }
  } catch (err: any) {
    console.warn(`[ES] Failed to connect/ensure index (${err.message}) — PostgreSQL fallback will be used.`);
  }
}
