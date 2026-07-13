import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { defaultSettings } from '@/lib/pos/seeds';
import { issueEmailVerification } from '@/lib/server/email-verification';
import { getPosPool } from '@/lib/server/pos-db';
import { hashPasswordServer, passwordStrengthError } from '@/lib/server/password';
import { OWNER_PERMISSIONS } from '@/lib/server/roles';
import {
  assertSameOrigin,
  errorResponse,
  HttpError,
  sameOriginRedirectUrl,
} from '@/lib/server/security';
import { ensureSecuritySchema } from '@/lib/server/security-schema';

function requiredText(value: unknown, label: string, maxLength = 200): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${label} is required`, 'VALIDATION_ERROR');
  }
  if (value.trim().length > maxLength) {
    throw new HttpError(400, `${label} is too long`, 'VALIDATION_ERROR');
  }
  return value.trim();
}

function businessSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'business';
  return `${base}-${randomBytes(3).toString('hex')}`;
}

export async function POST(request: NextRequest) {
  const isNativeForm = request.headers
    .get('content-type')
    ?.toLowerCase()
    .includes('application/x-www-form-urlencoded');
  try {
    assertSameOrigin(request);
    await ensureSecuritySchema();
    const body = isNativeForm
      ? Object.fromEntries((await request.formData()).entries())
      : ((await request.json()) as Record<string, unknown>);
    const businessName = requiredText(body.businessName, 'Business name');
    const ownerName = requiredText(body.ownerName, 'Owner name');
    const email = requiredText(body.email, 'Email').toLowerCase();
    const phone = requiredText(body.phone, 'Phone number', 50);
    const password = requiredText(body.password, 'Password', 200);
    if (isNativeForm && body.confirmPassword !== password) {
      throw new HttpError(400, 'Passwords do not match', 'VALIDATION_ERROR');
    }
    if (isNativeForm && body.agreeTerms !== 'on') {
      throw new HttpError(400, 'Accept the terms to continue', 'VALIDATION_ERROR');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, 'Enter a valid email address', 'VALIDATION_ERROR');
    }
    const strengthError = passwordStrengthError(password);
    if (strengthError) throw new HttpError(400, strengthError, 'WEAK_PASSWORD');

    const clientAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const registrationAttemptKey = createHash('sha256')
      .update(`register|${clientAddress}`)
      .digest('hex');
    const registrationRate = await getPosPool().query(
      `INSERT INTO pos_auth_attempts (attempt_key, failures, blocked_until, last_attempt_at)
       VALUES ($1, 1, NULL, now())
       ON CONFLICT (attempt_key) DO UPDATE SET
         failures = CASE
           WHEN pos_auth_attempts.last_attempt_at < now() - interval '1 hour' THEN 1
           ELSE pos_auth_attempts.failures + 1
         END,
         blocked_until = CASE
           WHEN pos_auth_attempts.last_attempt_at >= now() - interval '1 hour'
             AND pos_auth_attempts.failures + 1 > 3
           THEN now() + interval '1 hour'
           ELSE NULL
         END,
         last_attempt_at = now()
       RETURNING failures, blocked_until`,
      [registrationAttemptKey]
    );
    if (
      Number(registrationRate.rows[0]?.failures ?? 0) > 3 ||
      (registrationRate.rows[0]?.blocked_until &&
        new Date(registrationRate.rows[0].blocked_until) > new Date())
    ) {
      throw new HttpError(
        429,
        'Too many business registrations from this network. Try again later.',
        'RATE_LIMITED'
      );
    }

    const existingAccount = await getPosPool().query(
      `SELECT 1
       FROM pos_app_users
       WHERE lower(email) = $1
       LIMIT 1`,
      [email]
    );
    if (existingAccount.rowCount) {
      throw new HttpError(
        409,
        'An account already uses this email. Sign in or reset your password instead.',
        'ACCOUNT_EXISTS'
      );
    }

    const tenantId = `tenant-${randomUUID()}`;
    const userId = `user-${randomUUID()}`;
    const slug = businessSlug(businessName);
    const passwordHash = await hashPasswordServer(password);
    const now = new Date().toISOString();
    const settings = {
      ...defaultSettings,
      businessName,
      address: typeof body.address === 'string' ? body.address.trim().slice(0, 500) : '',
      phone,
      email,
      updatedAt: now,
    };
    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO pos_tenants
          (id, slug, name, registration_number, phone, address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          tenantId,
          slug,
          businessName,
          typeof body.registrationNumber === 'string'
            ? body.registrationNumber.trim()
            : typeof body.licenseNumber === 'string'
              ? body.licenseNumber.trim()
              : null,
          phone,
          settings.address,
        ]
      );
      await client.query(
        `INSERT INTO pos_app_users
          (tenant_id, id, name, email, phone, role, permissions, status, branch,
           password_hash, password_updated_at, email_verified_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'owner', $6::jsonb, 'active', 'Main Store', $7, now(), NULL, now(), now())
        `,
        [tenantId, userId, ownerName, email, phone, JSON.stringify(OWNER_PERMISSIONS), passwordHash]
      );
      await client.query(
        `INSERT INTO pos_tenant_records (tenant_id, store_name, record_id, data)
         VALUES ($1, 'settings', 'settings', $2::jsonb)`,
        [tenantId, JSON.stringify(settings)]
      );
      await client.query(
        `INSERT INTO pos_audit_log
          (tenant_id, user_id, action, entity_type, entity_id, after_data)
         VALUES ($1, $2, 'tenant.registered', 'tenant', $1, $3::jsonb)`,
        [tenantId, userId, JSON.stringify({ businessName, slug, ownerEmail: email })]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    let verification: { developmentVerificationUrl?: string } = {};
    let emailDeliveryFailed = false;
    try {
      verification = await issueEmailVerification({
        tenantId,
        userId,
        email,
        name: ownerName,
        businessName,
        requestOrigin: request.headers.get('origin') || request.nextUrl.origin,
      });
    } catch (deliveryError) {
      emailDeliveryFailed = true;
      console.error('Unable to deliver registration verification email', deliveryError);
    }
    const response = isNativeForm
      ? NextResponse.redirect(
          sameOriginRedirectUrl(
            request,
            `/verify-email/pending${emailDeliveryFailed ? '?delivery=failed' : ''}`
          ),
          303
        )
      : NextResponse.json(
          {
            message: emailDeliveryFailed
              ? 'Your account was created, but the confirmation email could not be delivered. Request a new confirmation email.'
              : 'Your account was created. Check your email to confirm the account.',
            requiresEmailVerification: true,
            emailDeliveryFailed,
            tenant: { id: tenantId, slug, name: businessName },
            ...verification,
          },
          { status: 201 }
        );
    return response;
  } catch (error) {
    if (isNativeForm) {
      return NextResponse.redirect(
        sameOriginRedirectUrl(request, '/sign-up-login?tab=signup&authError=registration'),
        303
      );
    }
    return errorResponse(error);
  }
}
