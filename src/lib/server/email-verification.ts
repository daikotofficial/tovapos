import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sendEmailVerification } from './email';
import { getPosPool } from './pos-db';

export async function issueEmailVerification(input: {
  tenantId: string;
  userId: string;
  email: string;
  name: string;
  businessName: string;
  requestOrigin: string;
}): Promise<{ developmentVerificationUrl?: string }> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await getPosPool().query(
    `WITH invalidated AS (
       UPDATE pos_email_verification_tokens SET used_at = now()
       WHERE tenant_id = $1 AND user_id = $2 AND used_at IS NULL
     )
     INSERT INTO pos_email_verification_tokens
       (id, tenant_id, user_id, token_hash, expires_at)
     VALUES ($3, $1, $2, $4, now() + interval '24 hours')`,
    [input.tenantId, input.userId, randomUUID(), tokenHash]
  );

  const siteUrl = (
    process.env.NODE_ENV === 'production'
      ? process.env.NEXT_PUBLIC_SITE_URL || input.requestOrigin
      : input.requestOrigin
  ).replace(/\/$/, '');
  const verificationUrl = `${siteUrl}/verify-email?token=${encodeURIComponent(token)}`;
  if (!input.email.toLowerCase().endsWith('.test')) {
    await sendEmailVerification({
      to: input.email,
      name: input.name,
      businessName: input.businessName,
      verificationUrl,
    });
  }

  return process.env.AUTH_DEV_LINKS === 'true' && process.env.NODE_ENV !== 'production'
    ? { developmentVerificationUrl: verificationUrl }
    : {};
}
