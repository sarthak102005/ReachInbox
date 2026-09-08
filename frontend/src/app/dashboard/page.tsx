'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { Button } from '@/components/Button';
import { ComposeModal } from '@/components/ComposeModal';
import { ScheduledTable } from '@/components/ScheduledTable';
import { SentTable } from '@/components/SentTable';
import { ToastProvider, useToast } from '@/components/Toast';
import type { SlackStatus } from '@/lib/types';

type Tab = 'scheduled' | 'sent';

// ─── Slack Badge ──────────────────────────────────────────────────────────────

function SlackBadge() {
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api.slack.status().then(setStatus).catch(() => {});
  }, []);

  const handleConnect = () => {
    window.location.href = '/api/slack/connect';
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await api.slack.disconnect();
      setStatus({ connected: false, teamName: null });
      toast('success', 'Slack disconnected');
    } catch {
      toast('error', 'Failed to disconnect Slack');
    } finally {
      setDisconnecting(false);
    }
  };

  if (!status) return null;

  return (
    <div className="flex items-center gap-2">
      {status.connected ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-success/10 border border-success/20 rounded-lg">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            <span className="text-xs text-success font-medium">
              Slack: {status.teamName}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDisconnect}
            loading={disconnecting}
            className="text-text-muted hover:text-error"
          >
            Disconnect
          </Button>
        </div>
      ) : (
        <Button
          id="connect-slack-btn"
          variant="secondary"
          size="sm"
          onClick={handleConnect}
          leftIcon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zm2.521-10.123a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
            </svg>
          }
        >
          Connect Slack
        </Button>
      )}
    </div>
  );
}

// ─── Search Bar ───────────────────────────────────────────────────────────────

function SearchBar({ onResults }: { onResults: (results: any[]) => void }) {
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!q.trim()) {
      onResults([]);
      return;
    }
    timeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await api.emails.search({ q });
        onResults(result.hits);
      } catch {
        onResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [q]);

  return (
    <div className="relative max-w-sm">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
        {searching ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        )}
      </div>
      <input
        id="search-emails-input"
        type="search"
        placeholder="Search emails..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full h-9 bg-elevated border border-white/10 rounded-lg pl-9 pr-3 text-sm
                   text-text-primary placeholder:text-text-muted
                   focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50
                   hover:border-white/20 transition-all"
      />
    </div>
  );
}

// ─── Dashboard Inner (inside ToastProvider) ───────────────────────────────────

function DashboardInner() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>('scheduled');
  const [composeOpen, setComposeOpen] = useState(false);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  // Handle OAuth callback params
  useEffect(() => {
    const slackParam = searchParams.get('slack');
    if (slackParam === 'connected') {
      toast('success', '✅ Slack connected successfully!');
    } else if (slackParam === 'denied') {
      toast('info', 'Slack connection cancelled');
    } else if (slackParam === 'error') {
      toast('error', 'Slack connection failed');
    }

    const errorParam = searchParams.get('error');
    if (errorParam === 'auth_failed') {
      toast('error', 'Google sign-in failed. Please try again.');
    }
  }, [searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-white/7 flex flex-col bg-surface">
        {/* Logo */}
        <div className="p-5 border-b border-white/7">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-violet-600
                           flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="font-bold text-text-primary text-sm">
              Reach<span className="text-primary">Inbox</span>
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          <button
            onClick={() => setTab('scheduled')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === 'scheduled'
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Scheduled
          </button>

          <button
            onClick={() => setTab('sent')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === 'sent'
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Sent
          </button>

          <a
            href="/admin/queues"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium
                       text-text-secondary hover:text-text-primary hover:bg-white/5 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Queue Dashboard ↗
          </a>
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-white/7">
          <div className="flex items-center gap-2.5 mb-3">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-8 h-8 rounded-full ring-2 ring-primary/30 flex-shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-semibold text-xs">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-text-primary truncate">{user.name}</p>
              <p className="text-xs text-text-muted truncate">{user.email}</p>
            </div>
          </div>
          <Button
            id="logout-btn"
            variant="ghost"
            size="sm"
            onClick={logout}
            className="w-full justify-start text-text-muted hover:text-error"
            leftIcon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            }
          >
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/7 bg-surface">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">
              {tab === 'scheduled' ? 'Scheduled Emails' : 'Sent Emails'}
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              {tab === 'scheduled'
                ? 'Emails queued for delivery — refreshes automatically'
                : 'Delivery history for your email campaigns'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <SlackBadge />
            <Button
              id="compose-btn"
              onClick={() => setComposeOpen(true)}
              leftIcon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Compose New Email
            </Button>
          </div>
        </header>

        {/* Search bar */}
        <div className="px-6 py-3 border-b border-white/7 bg-surface/50">
          <SearchBar onResults={(r) => {
            // TODO: display search results overlay — basic implementation
            if (r.length > 0) {
              console.log('Search results:', r);
            }
          }} />
        </div>

        {/* Table content */}
        <div className="flex-1 overflow-hidden glass-card m-4 rounded-xl">
          {tab === 'scheduled' ? (
            <ScheduledTable onCompose={() => setComposeOpen(true)} refreshTrigger={refreshTrigger} />
          ) : (
            <SentTable onCompose={() => setComposeOpen(true)} />
          )}
        </div>
      </main>

      {/* Compose modal */}
      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onScheduled={(n) => {
          setScheduledCount((c) => c + n);
          setTab('scheduled');
          setRefreshTrigger((prev) => prev + 1);
        }}
      />
    </div>
  );
}

// ─── Dashboard Page (wraps with ToastProvider) ────────────────────────────────

export default function DashboardPage() {
  return (
    <ToastProvider>
      <Suspense fallback={<div className="min-h-screen bg-bg flex items-center justify-center text-text-muted">Loading dashboard...</div>}>
        <DashboardInner />
      </Suspense>
    </ToastProvider>
  );
}
