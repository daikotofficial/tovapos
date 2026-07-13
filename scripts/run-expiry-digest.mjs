const host = process.env.TOVAPOS_WEB_HOSTPORT;
const secret = process.env.CRON_SECRET;

if (!host || !secret) {
  throw new Error('TOVAPOS_WEB_HOSTPORT and CRON_SECRET are required');
}

let cursor = '';
for (let page = 0; page < 10_000; page += 1) {
  const response = await fetch(`http://${host}/api/internal/expiry-digest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cursor }),
    signal: AbortSignal.timeout(300_000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Expiry digest failed (${response.status}): ${body.slice(0, 1000)}`);
  }
  const result = JSON.parse(body);
  process.stdout.write(`${body}\n`);
  if (!result.nextCursor) break;
  cursor = result.nextCursor;
}
