import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sendEmailVerification } from './email';
import { getPosPool } from './pos-db';

export async function ensureEmailVerificationSchema(): Promise<void> {
  await getPosPool().query(`
    ALTER TABLE pos_app_users
      ADD COLUMN IF NOT EXISTS email_verified_at timestamptz DEFAULT now();

    CREATE TABLE IF NOT EXISTS pos_email_verification_tokens (
      id text PRIMARY KEY,
      tenant_id text NOT NULL,
      user_id text NOT NULL,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (tenant_id, user_id)
        REFERENCES pos_app_users(tenant_id, id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS pos_email_verification_tokens_user_idx
      ON pos_email_verification_tokens (tenant_id, user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS pos_email_verification_tokens_expiry_idx
      ON pos_email_verification_tokens (expires_at);
  `);
}

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
