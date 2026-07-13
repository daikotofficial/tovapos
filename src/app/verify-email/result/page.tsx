import Link from 'next/link';
import PasswordPageShell from '@/components/auth/PasswordPageShell';

export default function VerificationResultPage() {
  return (
    <PasswordPageShell
      title="Confirmation link unavailable"
      description="This confirmation link is invalid, expired, or has already been used."
    >
      <Link href="/resend-verification" className="font-semibold text-primary hover:underline">
        Request a new confirmation email
      </Link>
    </PasswordPageShell>
  );
}
