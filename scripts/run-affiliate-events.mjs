const host = process.env.TOVAPOS_WEB_HOSTPORT;
const secret = process.env.CRON_SECRET;

if (!host || !secret) throw new Error('TOVAPOS_WEB_HOSTPORT and CRON_SECRET are required');

const response = await fetch(`http://${host}/api/internal/affiliate-events`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
  body: '{}',
  signal: AbortSignal.timeout(60_000),
});
const body = await response.text();
if (!response.ok)
  throw new Error(`Affiliate event delivery failed (${response.status}): ${body.slice(0, 1000)}`);
process.stdout.write(`${body}\n`);
