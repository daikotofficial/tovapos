function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  businessName: string;
  resetUrl: string;
}): Promise<void> {
  const name = escapeHtml(input.name);
  const businessName = escapeHtml(input.businessName);
  const resetUrl = escapeHtml(input.resetUrl);
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#071412;max-width:560px;margin:auto">
        <h1 style="font-size:24px">Reset your password</h1>
        <p>Hello ${name},</p>
        <p>We received a password reset request for your ${businessName} TOVAPOS account.</p>
        <p><a href="${resetUrl}" style="display:inline-block;background:#128174;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700">Reset password</a></p>
        <p>This link expires in 30 minutes and can only be used once. If you did not request this, you can safely ignore this email.</p>
      </div>`;
  const text = `Hello ${input.name},\n\nReset your TOVAPOS password for ${input.businessName}: ${input.resetUrl}\n\nThis link expires in 30 minutes and can only be used once. If you did not request this, ignore this email.`;
  await sendTransactionalEmail({
    to: input.to,
    subject: 'Reset your TOVAPOS password',
    html,
    text,
    category: 'password-reset',
  });
}

export async function sendEmailVerification(input: {
  to: string;
  name: string;
  businessName: string;
  verificationUrl: string;
}): Promise<void> {
  const name = escapeHtml(input.name);
  const businessName = escapeHtml(input.businessName);
  const verificationUrl = escapeHtml(input.verificationUrl);
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#071412;max-width:560px;margin:auto">
    <h1 style="font-size:24px">Confirm your email address</h1>
    <p>Hello ${name},</p>
    <p>Confirm this email address to activate the ${businessName} TOVAPOS account.</p>
    <p><a href="${verificationUrl}" style="display:inline-block;background:#128174;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700">Confirm email address</a></p>
    <p>This link expires in 24 hours. If you did not create this account, you can ignore this email.</p>
  </div>`;
  const text = `Hello ${input.name},\n\nConfirm your email address for ${input.businessName}: ${input.verificationUrl}\n\nThis link expires in 24 hours.`;
  await sendTransactionalEmail({
    to: input.to,
    subject: 'Confirm your TOVAPOS email address',
    html,
    text,
    category: 'email-verification',
  });
}

export interface ExpiryDigestItem {
  name: string;
  sku: string;
  batchLot: string;
  currentQty: number;
  expiryDate: string;
  daysRemaining: number;
}

export async function sendExpiryDigestEmail(input: {
  to: string[];
  businessName: string;
  alertDays: number;
  items: ExpiryDigestItem[];
  reportUrl: string;
}): Promise<void> {
  const businessName = escapeHtml(input.businessName);
  const reportUrl = escapeHtml(input.reportUrl);
  const expiredCount = input.items.filter((item) => item.daysRemaining < 0).length;
  const expiringCount = input.items.length - expiredCount;
  const previewRows = input.items.slice(0, 100);
  const rows = previewRows
    .map((item) => {
      const status =
        item.daysRemaining < 0
          ? `Expired ${Math.abs(item.daysRemaining)} day(s) ago`
          : item.daysRemaining === 0
            ? 'Expires today'
            : `${item.daysRemaining} day(s) remaining`;
      const color = item.daysRemaining < 0 ? '#b42318' : '#b54708';
      return `<tr>
        <td style="padding:10px;border-bottom:1px solid #e4ebe9"><strong>${escapeHtml(item.name)}</strong><br><span style="color:#66736f;font-size:12px">SKU: ${escapeHtml(item.sku || '—')} · Batch: ${escapeHtml(item.batchLot || '—')}</span></td>
        <td style="padding:10px;border-bottom:1px solid #e4ebe9;text-align:right">${item.currentQty.toLocaleString()}</td>
        <td style="padding:10px;border-bottom:1px solid #e4ebe9">${escapeHtml(item.expiryDate)}</td>
        <td style="padding:10px;border-bottom:1px solid #e4ebe9;color:${color};font-weight:700">${status}</td>
      </tr>`;
    })
    .join('');
  const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = [
    ['Product', 'SKU', 'Batch', 'Quantity', 'Expiry date', 'Days remaining'].map(csvCell).join(','),
    ...input.items.map((item) =>
      [item.name, item.sku, item.batchLot, item.currentQty, item.expiryDate, item.daysRemaining]
        .map(csvCell)
        .join(',')
    ),
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#071412;max-width:760px;margin:auto">
    <div style="background:#071412;color:#fff;padding:24px;border-radius:10px 10px 0 0">
      <div style="font-size:12px;color:#8ee8df;font-weight:700;text-transform:uppercase">TOVAPOS weekly inventory alert</div>
      <h1 style="font-size:24px;margin:8px 0 4px">Expiry report</h1>
      <p style="margin:0;color:#c5d2cf">${businessName} · Products expiring within ${input.alertDays} days</p>
    </div>
    <div style="border:1px solid #d7e2df;border-top:0;padding:24px;border-radius:0 0 10px 10px">
      <div style="display:flex;gap:12px;margin-bottom:20px">
        <div style="flex:1;background:#fff4ed;padding:14px;border-radius:8px"><strong style="font-size:22px;color:#b42318">${expiredCount}</strong><br><span style="font-size:12px;color:#66736f">Expired with stock</span></div>
        <div style="flex:1;background:#fffaeb;padding:14px;border-radius:8px"><strong style="font-size:22px;color:#b54708">${expiringCount}</strong><br><span style="font-size:12px;color:#66736f">Expiring soon</span></div>
      </div>
      ${
        input.items.length
          ? `<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#edf3f1;text-align:left"><th style="padding:10px">Product</th><th style="padding:10px;text-align:right">Qty</th><th style="padding:10px">Expiry</th><th style="padding:10px">Status</th></tr></thead><tbody>${rows}</tbody></table>`
          : '<p style="padding:18px;background:#ecfdf3;border-radius:8px;color:#027a48;font-weight:700">No expired or soon-to-expire products currently require attention.</p>'
      }
      ${input.items.length > previewRows.length ? `<p style="font-size:12px;color:#66736f">The email preview shows the first ${previewRows.length} items. The attached CSV contains all ${input.items.length} items.</p>` : ''}
      <p style="margin-top:22px"><a href="${reportUrl}" style="display:inline-block;background:#128174;color:#fff;padding:11px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open expiry report</a></p>
      <p style="font-size:12px;color:#66736f;margin-top:20px">This scheduled report is generated every Monday at 7:00 AM West Africa Time from your TOVAPOS inventory settings.</p>
    </div>
  </div>`;
  const text = `${input.businessName} weekly expiry report\n\nExpired with stock: ${expiredCount}\nExpiring within ${input.alertDays} days: ${expiringCount}\n\nThe attached CSV contains the complete product list.\n\nOpen report: ${input.reportUrl}`;
  await sendTransactionalEmail({
    to: input.to,
    subject: `${input.businessName}: weekly expiry report`,
    html,
    text,
    category: 'weekly-expiry-digest',
    attachment: {
      filename: `tovapos-expiry-report-${new Date().toISOString().slice(0, 10)}.csv`,
      content: csv,
      contentType: 'text/csv;charset=utf-8',
    },
  });
}

async function sendTransactionalEmail(input: {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  category: string;
  attachment?: { filename: string; content: string; contentType: string };
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  let response: Response;

  if (apiKey && process.env.PASSWORD_RESET_FROM_EMAIL) {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.PASSWORD_RESET_FROM_EMAIL,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        tags: [{ name: 'category', value: input.category }],
        attachments: input.attachment
          ? [
              {
                filename: input.attachment.filename,
                content: Buffer.from(input.attachment.content).toString('base64'),
              },
            ]
          : undefined,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } else if (mailgunConfigured()) {
    const domain = process.env.MAILGUN_DOMAIN!;
    const baseUrl = allowedMailgunBaseUrl(process.env.MAILGUN_BASE_URL);
    const form = new FormData();
    form.set('from', process.env.PASSWORD_RESET_FROM_EMAIL || `TOVAPOS <no-reply@${domain}>`);
    const recipients = Array.isArray(input.to) ? input.to : [input.to];
    for (const recipient of recipients) form.append('to', recipient);
    form.set('subject', input.subject);
    form.set('html', input.html);
    form.set('text', input.text);
    form.set('o:tag', input.category);
    if (input.attachment) {
      form.append(
        'attachment',
        new Blob([input.attachment.content], { type: input.attachment.contentType }),
        input.attachment.filename
      );
    }
    response = await fetch(`${baseUrl}/v3/${encodeURIComponent(domain)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64')}`,
      },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
  } else {
    throw new Error('Transactional email delivery is not configured');
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Transactional email failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}

function allowedMailgunBaseUrl(value: string | undefined): string {
  const parsed = new URL(value || 'https://api.mailgun.net');
  if (
    parsed.protocol !== 'https:' ||
    !['api.mailgun.net', 'api.eu.mailgun.net'].includes(parsed.hostname)
  ) {
    throw new Error('MAILGUN_BASE_URL must use an official Mailgun HTTPS API endpoint');
  }
  return parsed.origin;
}

export function mailgunConfigured(): boolean {
  return Boolean(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
}

export function passwordResetEmailConfigured(): boolean {
  return Boolean(
    (process.env.RESEND_API_KEY && process.env.PASSWORD_RESET_FROM_EMAIL) || mailgunConfigured()
  );
}
