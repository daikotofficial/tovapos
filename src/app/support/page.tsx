'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { LifeBuoy, Loader2, MessageSquare, Send } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import type { SupportTicket } from '@/lib/pos/types';

export default function SupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<SupportTicket['priority']>('normal');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const openCount = useMemo(
    () =>
      tickets.filter((ticket) => ticket.status === 'open' || ticket.status === 'pending').length,
    [tickets]
  );

  const loadTickets = async () => {
    setError('');
    try {
      const response = await fetch('/api/support-tickets', { cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as {
        tickets?: SupportTicket[];
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to load support tickets');
      setTickets(payload?.tickets ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load support tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTickets();
  }, []);

  const submitTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/support-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, priority }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ticket?: SupportTicket;
        error?: string;
      } | null;
      if (!response.ok || !payload?.ticket) {
        throw new Error(payload?.error ?? 'Unable to send support request');
      }
      setTickets((current) => [payload.ticket!, ...current]);
      setSubject('');
      setMessage('');
      setPriority('normal');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to send support request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout title="Support" subtitle="Send tickets to TOVAPOS support and track responses">
      <div className="mx-auto grid max-w-6xl gap-4 px-3 py-4 sm:gap-5 sm:p-6 lg:grid-cols-[380px_1fr]">
        <form
          id="new-ticket"
          onSubmit={submitTicket}
          className="rounded-xl border border-border bg-card shadow-card"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <LifeBuoy size={16} className="text-primary" />
            <span className="text-sm font-semibold">New Support Ticket</span>
          </div>
          <div className="space-y-4 p-5">
            <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Tickets are sent securely to TOVAPOS support inside the platform admin console.
            </p>
            {error && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
                {error}
              </p>
            )}
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Subject</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="What do you need help with?"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Priority</span>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as SupportTicket['priority'])}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Message</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-36 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="Describe the issue, screen, cashier, receipt number, or error."
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Send Ticket
            </button>
          </div>
        </form>

        <section className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-primary" />
              <span className="text-sm font-semibold">Ticket History</span>
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
              {openCount} open
            </span>
          </div>
          <div className="divide-y divide-border">
            {loading ? (
              <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
                Loading tickets
              </div>
            ) : tickets.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No tickets yet.</p>
            ) : (
              tickets.map((ticket) => (
                <article key={ticket.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{ticket.subject}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(ticket.createdAt).toLocaleString()} · {ticket.priority}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                      {ticket.status}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/85">
                    {ticket.message}
                  </p>
                  {ticket.response && (
                    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                      <p className="text-xs font-bold text-primary">
                        Response from {ticket.respondedBy ?? 'TOVAPOS Support'}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                        {ticket.response}
                      </p>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
