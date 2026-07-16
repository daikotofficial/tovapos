'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';

function AdminInviteForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
      const response = await fetch('/api/admin/invite', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to accept invite');
      setComplete(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to accept invite');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-modal">
      <div className="mb-6 flex items-center gap-3">
        <AppLogo size={38} />
        <div>
          <p className="text-xl font-black">Accept Admin Invite</p>
          <p className="text-sm text-muted-foreground">Create your TOVAPOS Admin password</p>
        </div>
      </div>
      {complete ? (
        <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 size={18} />
            Admin password created
          </div>
          <Link href="/admin" className="mt-3 inline-block underline">
            Go to admin login
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {!token && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              This invite link is missing a token.
            </p>
          )}
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Confirm Password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !token}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ShieldCheck size={16} />
            )}
            Create Password
          </button>
        </form>
      )}
    </div>
  );
}

export default function AdminInvitePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            Loading invite
          </div>
        }
      >
        <AdminInviteForm />
      </Suspense>
    </main>
  );
}
