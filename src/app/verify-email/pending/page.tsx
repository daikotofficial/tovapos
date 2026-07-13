import Link from 'next/link';
import PasswordPageShell from '@/components/auth/PasswordPageShell';

export default async function VerificationPendingPage({
  searchParams,
}: {
  searchParams?: Promise<{ delivery?: string }>;
}) {
  const params = await searchParams;
  const failed = params?.delivery === 'failed';
  const resent = params?.delivery === 'resent';
  return (
    <PasswordPageShell
      title="Check your email"
      description={
        failed
          ? 'Your account was created, but the confirmation email could not be delivered.'
          : resent
            ? 'If an unconfirmed account uses that email, a new confirmation link has been sent.'
            : 'We sent a confirmation link to the email address used during registration.'
      }
    >
      <div className="space-y-3 text-sm leading-6 text-muted-foreground">
        <p>Open the email and follow the confirmation link. The link expires after 24 hours.</p>
        <Link href="/resend-verification" className="font-semibold text-primary hover:underline">
          Resend confirmation email
        </Link>
      </div>
    </PasswordPageShell>
  );
}
