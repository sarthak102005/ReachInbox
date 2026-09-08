'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

function LoginContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'auth_failed') {
      setErrorMsg('Google authentication failed. Please verify redirect URIs in Google Cloud Console.');
    } else if (errorParam === 'invalid_state' || errorParam === 'missing_state') {
      setErrorMsg('Security state token mismatch or expired. Please try signing in again.');
    } else if (errorParam === 'oauth_denied') {
      setErrorMsg('Sign-in was cancelled or denied by Google.');
    } else if (errorParam) {
      setErrorMsg(`Sign-in error: ${errorParam}`);
    }
  }, [searchParams]);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full
                       bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full
                       bg-violet-500/5 blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                       w-[800px] h-[800px] rounded-full bg-primary/3 blur-[150px]" />
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-md mx-auto px-4 animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
                         bg-gradient-to-br from-primary to-violet-600 shadow-2xl shadow-primary/30 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">
            Reach<span className="text-primary">Inbox</span>
          </h1>
          <p className="mt-2 text-text-secondary text-sm">
            Production-grade email scheduling & automation
          </p>
        </div>

        {/* Card */}
        <div className="gradient-border p-8 shadow-2xl shadow-black/50">
          <h2 className="text-xl font-semibold text-text-primary mb-2 text-center">
            Welcome back
          </h2>
          <p className="text-sm text-text-secondary text-center mb-6">
            Sign in to manage your email campaigns
          </p>

          {/* Error Banner */}
          {errorMsg && (
            <div className="mb-6 p-3 bg-error/10 border border-error/30 rounded-xl text-xs text-error text-center font-medium">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Google Sign In button */}
          <button
            id="google-signin-btn"
            onClick={handleGoogleLogin}
            className="
              w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl
              bg-white text-gray-800 font-semibold text-sm
              hover:bg-gray-50 active:scale-[0.98]
              transition-all duration-150 shadow-lg shadow-black/20
              focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background
            "
          >
            {/* Google Logo SVG */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="mt-6 text-center">
            <p className="text-xs text-text-muted">
              By signing in, you agree to use this for the ReachInbox assignment demo.
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          {[
            { icon: '⚡', label: 'BullMQ Queues', sub: 'Redis-backed' },
            { icon: '🔒', label: 'Idempotent', sub: 'No double-sends' },
            { icon: '📊', label: 'Elasticsearch', sub: 'Full-text search' },
          ].map((f) => (
            <div key={f.label} className="glass-card p-3 text-center">
              <div className="text-xl mb-1">{f.icon}</div>
              <div className="text-xs font-semibold text-text-primary">{f.label}</div>
              <div className="text-xs text-text-muted">{f.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg flex items-center justify-center text-text-muted">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
