import nodemailer from 'nodemailer';
import { env } from '../config/env';

interface EtherealAccount {
  user: string;
  pass: string;
}

let _account: EtherealAccount | null = null;

/**
 * Returns (and caches) the Ethereal SMTP credentials.
 * If ETHEREAL_USER/PASS are set in env, uses those.
 * Otherwise auto-generates a new Ethereal test account on first call.
 */
async function getEtherealAccount(): Promise<EtherealAccount> {
  if (_account) return _account;

  if (env.ETHEREAL_USER && env.ETHEREAL_PASS) {
    _account = { user: env.ETHEREAL_USER, pass: env.ETHEREAL_PASS };
    console.log('[Ethereal] Using credentials from env:', _account.user);
  } else {
    const testAccount = await nodemailer.createTestAccount();
    _account = { user: testAccount.user, pass: testAccount.pass };
    console.log('[Ethereal] Auto-generated test account:', _account.user);
    console.log('[Ethereal] Preview emails at: https://ethereal.email');
  }

  return _account;
}

export interface SenderCredentials {
  emailAddress: string;
  displayName: string;
  etherealUser: string;
  etherealPass: string;
}

export interface EmailJobData {
  id: string;
  recipientEmail: string;
  subject: string;
  body: string;
}

export interface SendResult {
  messageId: string;
  previewUrl: string | false;
}

/**
 * Sends an email via Ethereal SMTP using the sender's stored credentials.
 * Falls back to the global auto-generated account if sender creds are empty.
 */
export async function sendEmailViaEthereal(
  sender: SenderCredentials,
  job: EmailJobData,
): Promise<SendResult> {
  // Use sender-specific creds if available, else fall back to shared account
  let user = sender.etherealUser;
  let pass = sender.etherealPass;

  if (!user || !pass) {
    const acct = await getEtherealAccount();
    user = acct.user;
    pass = acct.pass;
  }

  const port = Number(process.env.ETHEREAL_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port,
    secure: false,
    requireTLS: true,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  const info = await transporter.sendMail({
    from: `"${sender.displayName}" <${sender.emailAddress}>`,
    to: job.recipientEmail,
    subject: job.subject,
    html: job.body,
    text: job.body.replace(/<[^>]+>/g, ''), // Strip HTML for text part
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  console.log(`[Ethereal] Sent ${info.messageId} → preview: ${previewUrl}`);

  return { messageId: info.messageId, previewUrl };
}

/**
 * Provision a fresh Ethereal test account and return its credentials.
 * Used when creating a new Sender entity.
 */
export async function provisionEtherealAccount(): Promise<{ user: string; pass: string }> {
  const testAccount = await nodemailer.createTestAccount();
  return { user: testAccount.user, pass: testAccount.pass };
}
