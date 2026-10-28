'use client';

import { useState, type FormEvent } from 'react';

const inputClass =
  'auth-light-input h-12 w-full rounded-md border border-border bg-white px-3 text-sm text-[#071412] placeholder:text-[#8b9a96] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

export default function ResendVerificationForm({ initialEmail = '' }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
        code?: string;
      } | null;
      if (!response.ok) {
        setError(
          payload?.code === 'RATE_LIMITED'
            ? 'Too many requests. Please wait 15 minutes before trying again.'
            : 'We could not send the confirmation email right now. Please try again shortly.'
        );
        return;
      }
      setMessage(
        payload?.message ??
          'If an unconfirmed account uses that email, a new confirmation link will be sent.'
      );
    } catch {
      setError('We could not reach the confirmation service. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1.5 text-sm font-medium">
        <span>Email Address</span>
        <input
          required
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          className={inputClass}
          placeholder="you@business.com"
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      {message && (
        <p className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-sm leading-6 text-success">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Sending…' : 'Send Confirmation Email'}
      </button>
    </form>
  );
}
