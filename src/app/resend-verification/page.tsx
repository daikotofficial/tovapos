import PasswordPageShell from '@/components/auth/PasswordPageShell';
import ResendVerificationForm from './ResendVerificationForm';

export default async function ResendVerificationPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; email?: string }>;
}) {
  const params = await searchParams;
  const email = typeof params?.email === 'string' ? params.email : '';
  return (
    <PasswordPageShell
      title="Resend confirmation email"
      description="Enter the email address used to register your TOVAPOS account."
    >
      <ResendVerificationForm initialEmail={email} />
    </PasswordPageShell>
  );
}
