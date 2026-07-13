'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import PasswordPageShell from '@/components/auth/PasswordPageShell';

export default function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to reset your password');
      setComplete(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to reset your password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PasswordPageShell
      title="Set a new password"
      description="Use at least 10 characters, including uppercase and lowercase letters, a number, and a symbol."
    >
      {complete ? (
        <div className="rounded-md border border-success/30 bg-success/10 p-4 text-sm text-success">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 size={18} /> Password reset complete
          </div>
          <Link href="/sign-up-login?tab=login" className="mt-3 inline-block underline">
            Sign in with your new password
          </Link>
        </div>
      ) : !token ? (
        <p className="rounded-md border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          This password reset link is incomplete. Request a new link from the sign-in page.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">
            <span>New Password</span>
            <div className="relative">
              <input
                required
                minLength={10}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                className="h-12 w-full rounded-md border border-border bg-white px-3 pr-10 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Confirm New Password</span>
            <input
              required
              minLength={10}
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className="h-12 w-full rounded-md border border-border bg-white px-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Reset Password
          </button>
        </form>
      )}
    </PasswordPageShell>
  );
}
