'use client';

import { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import PasswordPageShell from '@/components/auth/PasswordPageShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [developmentResetUrl, setDevelopmentResetUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
        developmentResetUrl?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to submit your request');
      setMessage(payload?.message ?? 'Check your email for the next step.');
      setDevelopmentResetUrl(payload?.developmentResetUrl ?? '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to submit your request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PasswordPageShell
      title="Forgot your password?"
      description="Enter the email address you use to sign in."
    >
      {message ? (
        <div className="rounded-md border border-success/30 bg-success/10 p-4 text-sm leading-6 text-success">
          <div className="flex gap-2">
            <Mail size={18} className="mt-0.5 shrink-0" />
            <p>{message}</p>
          </div>
          {developmentResetUrl && (
            <a href={developmentResetUrl} className="mt-3 block font-semibold underline">
              Open development reset link
            </a>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Email Address</span>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="h-12 w-full rounded-md border border-border bg-white px-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="you@business.com"
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Send Reset Link
          </button>
        </form>
      )}
    </PasswordPageShell>
  );
}
