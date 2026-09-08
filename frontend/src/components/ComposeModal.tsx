'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Papa from 'papaparse';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input, Textarea } from './Input';
import { useToast } from './Toast';
import { api } from '@/lib/api';
import type { Sender } from '@/lib/types';

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
  onScheduled?: (count: number) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ComposeModal({ open, onClose, onScheduled }: ComposeModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [senders, setSenders] = useState<Sender[]>([]);
  const [form, setForm] = useState({
    subject: '',
    body: '',
    senderId: '',
    startTime: '',
    delaySeconds: '2',
    hourlyLimit: '10',
  });
  const [recipients, setRecipients] = useState<string[]>([]);
  const [invalidEmails, setInvalidEmails] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load senders on open
  useEffect(() => {
    if (!open) return;
    api.senders.list().then(({ senders: s }) => {
      setSenders(s);
      if (s.length > 0 && !form.senderId) {
        setForm((f) => ({ ...f, senderId: s[0].id }));
      }
    }).catch(() => {});
  }, [open]);

  const parseEmails = useCallback((raw: string): string[] => {
    return raw
      .split(/[\n,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);
  }, []);

  const handleCSVUpload = useCallback(
    (file: File) => {
      setCsvFileName(file.name);
      Papa.parse<string[]>(file, {
        complete: (results) => {
          const allEmails: string[] = [];
          for (const row of results.data) {
            for (const cell of row) {
              allEmails.push(...parseEmails(cell));
            }
          }
          const valid = allEmails.filter((e) => EMAIL_REGEX.test(e));
          const invalid = allEmails.filter((e) => e && !EMAIL_REGEX.test(e));
          const unique = [...new Set(valid)];
          setRecipients(unique);
          setInvalidEmails(invalid);
          toast('info', `Parsed ${unique.length} valid email(s) from CSV`);
        },
        error: () => toast('error', 'Failed to parse CSV file'),
      });
    },
    [parseEmails, toast],
  );

  const handleTextPaste = useCallback(
    (value: string) => {
      const all = parseEmails(value);
      const valid = all.filter((e) => EMAIL_REGEX.test(e));
      const invalid = all.filter((e) => e && !EMAIL_REGEX.test(e));
      const unique = [...new Set(valid)];
      setRecipients(unique);
      setInvalidEmails(invalid);
    },
    [parseEmails],
  );

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.subject.trim()) errs.subject = 'Subject is required';
    if (!form.body.trim()) errs.body = 'Body is required';
    if (!form.senderId) errs.senderId = 'Select a sender';
    if (!form.startTime) errs.startTime = 'Start time is required';
    if (recipients.length === 0) errs.recipients = 'Add at least one valid recipient';
    if (parseInt(form.delaySeconds) < 0) errs.delaySeconds = 'Must be ≥ 0';
    if (parseInt(form.hourlyLimit) < 1) errs.hourlyLimit = 'Must be ≥ 1';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    try {
      const result = await api.emails.schedule({
        subject: form.subject.trim(),
        body: form.body.trim(),
        recipients,
        senderId: form.senderId,
        startTime: new Date(form.startTime).toISOString(),
        delaySeconds: parseInt(form.delaySeconds) || 2,
        hourlyLimit: parseInt(form.hourlyLimit) || 10,
      });

      if (result.invalid && result.invalid.length > 0) {
        const preview = result.invalid.slice(0, 3).join(', ');
        const extra = result.invalid.length > 3 ? ` (+${result.invalid.length - 3} more)` : '';
        toast(
          'warning',
          `Scheduled ${result.scheduled} email(s). ${result.invalid.length} address(es) rejected by server: ${preview}${extra}`,
        );
      } else {
        toast('success', `${result.scheduled} email(s) scheduled successfully!`);
      }

      onScheduled?.(result.scheduled);
      handleClose();
    } catch (err: any) {
      const invalidList: string[] = err.invalid || err.data?.invalid;
      if (invalidList && invalidList.length > 0) {
        const preview = invalidList.slice(0, 3).join(', ');
        const extra = invalidList.length > 3 ? ` (+${invalidList.length - 3} more)` : '';
        toast('error', `${err.message}: ${preview}${extra}`);
        setInvalidEmails(invalidList);
      } else {
        toast('error', err.message ?? 'Failed to schedule emails');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setForm({ subject: '', body: '', senderId: senders[0]?.id ?? '', startTime: '', delaySeconds: '2', hourlyLimit: '10' });
    setRecipients([]);
    setInvalidEmails([]);
    setCsvFileName('');
    setErrors({});
    onClose();
  }

  // Default start time to 5 minutes from now
  const defaultStartTime = new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Compose New Email"
      description="Schedule emails to be sent to one or more recipients."
      size="lg"
    >
      <div className="space-y-5">
        {/* Sender */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-secondary">
            From Sender <span className="text-error">*</span>
          </label>
          <select
            id="compose-sender"
            value={form.senderId}
            onChange={(e) => setForm((f) => ({ ...f, senderId: e.target.value }))}
            className="h-9 bg-elevated border border-white/10 rounded-lg px-3 text-sm text-text-primary
                       focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50
                       hover:border-white/20 transition-all"
          >
            <option value="" disabled>Select a sender...</option>
            {senders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName} &lt;{s.emailAddress}&gt;
              </option>
            ))}
          </select>
          {errors.senderId && <p className="text-xs text-error">{errors.senderId}</p>}
        </div>

        {/* Subject */}
        <Input
          label="Subject"
          id="compose-subject"
          placeholder="Your email subject..."
          value={form.subject}
          onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          error={errors.subject}
          required
        />

        {/* Body */}
        <Textarea
          label="Body"
          id="compose-body"
          placeholder="Write your email content here..."
          rows={5}
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          error={errors.body}
          required
        />

        {/* Recipients */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-secondary">
            Recipients <span className="text-error">*</span>
          </label>

          {/* Upload + paste area */}
          <div
            className="border-2 border-dashed border-white/10 rounded-xl p-4 hover:border-primary/30
                       transition-colors cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCSVUpload(file);
                e.target.value = '';
              }}
            />

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {csvFileName || 'Upload CSV or text file'}
                </p>
                <p className="text-xs text-text-muted">
                  One email per line, or comma/semicolon separated
                </p>
              </div>
            </div>
          </div>

          {/* Or paste emails */}
          <Textarea
            id="compose-emails-paste"
            placeholder="Or paste email addresses here (one per line, comma, or semicolon separated)..."
            rows={3}
            onChange={(e) => handleTextPaste(e.target.value)}
            hint="Emails are validated client-side and again server-side"
          />

          {/* Count indicator */}
          {recipients.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-success/10 border border-success/20 rounded-lg">
                <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-success font-medium">
                  {recipients.length} valid email address{recipients.length !== 1 ? 'es' : ''} detected
                </span>
              </div>
              {invalidEmails.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-warning/10 border border-warning/20 rounded-lg">
                  <span className="text-sm text-warning font-medium">
                    {invalidEmails.length} invalid skipped
                  </span>
                </div>
              )}
            </div>
          )}
          {errors.recipients && <p className="text-xs text-error">{errors.recipients}</p>}
        </div>

        {/* Scheduling options */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-3">
            <Input
              label="Start Time"
              id="compose-start-time"
              type="datetime-local"
              defaultValue={defaultStartTime}
              onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              error={errors.startTime}
              required
            />
          </div>
          <Input
            label="Delay Between Emails (sec)"
            id="compose-delay"
            type="number"
            min="0"
            max="3600"
            value={form.delaySeconds}
            onChange={(e) => setForm((f) => ({ ...f, delaySeconds: e.target.value }))}
            hint="Per-sender override"
            error={errors.delaySeconds}
          />
          <Input
            label="Hourly Limit"
            id="compose-hourly-limit"
            type="number"
            min="1"
            max="10000"
            value={form.hourlyLimit}
            onChange={(e) => setForm((f) => ({ ...f, hourlyLimit: e.target.value }))}
            hint="Max emails/hour (per sender)"
            error={errors.hourlyLimit}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/7">
          <Button variant="ghost" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            id="compose-schedule-btn"
            onClick={handleSubmit}
            loading={loading}
            leftIcon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            }
          >
            Schedule {recipients.length > 0 ? `${recipients.length} ` : ''}Email{recipients.length !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
