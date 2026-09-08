import 'dotenv/config';

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getIntEnv(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const n = parseInt(val, 10);
  if (isNaN(n)) throw new Error(`Environment variable ${key} must be an integer`);
  return n;
}

export const env = {
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  PORT: getIntEnv('PORT', 4000),

  // Database
  DATABASE_URL: requireEnv('DATABASE_URL'),

  // Redis
  REDIS_URL: getEnv('REDIS_URL', 'redis://localhost:6379'),

  // Elasticsearch
  ELASTICSEARCH_URL: getEnv('ELASTICSEARCH_URL', 'http://localhost:9200'),

  // Google OAuth
  GOOGLE_CLIENT_ID: getEnv('GOOGLE_CLIENT_ID', ''),
  GOOGLE_CLIENT_SECRET: getEnv('GOOGLE_CLIENT_SECRET', ''),
  GOOGLE_CALLBACK_URL: getEnv('GOOGLE_CALLBACK_URL', 'http://localhost:4000/api/auth/google/callback'),

  // Slack OAuth
  SLACK_CLIENT_ID: getEnv('SLACK_CLIENT_ID', ''),
  SLACK_CLIENT_SECRET: getEnv('SLACK_CLIENT_SECRET', ''),
  SLACK_CALLBACK_URL: getEnv('SLACK_CALLBACK_URL', 'http://localhost:4000/api/slack/callback'),

  // Session
  SESSION_SECRET: requireEnv('SESSION_SECRET'),

  // Ethereal
  ETHEREAL_USER: getEnv('ETHEREAL_USER', ''),
  ETHEREAL_PASS: getEnv('ETHEREAL_PASS', ''),

  // Rate limiting defaults
  MAX_EMAILS_PER_HOUR: getIntEnv('MAX_EMAILS_PER_HOUR', 10),
  MIN_DELAY_SECONDS: getIntEnv('MIN_DELAY_SECONDS', 2),

  // Worker
  WORKER_CONCURRENCY: getIntEnv('WORKER_CONCURRENCY', 5),

  // CORS
  FRONTEND_URL: getEnv('FRONTEND_URL', 'http://localhost:3000'),
} as const;
