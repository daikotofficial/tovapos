import PasswordPageShell from '@/components/auth/PasswordPageShell';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = Array.isArray(params?.token) ? params.token[0] : params?.token;
  return (
    <PasswordPageShell
      title="Confirm your email"
      description="Confirm your email address to activate your TOVAPOS account."
    >
      {token ? (
        <form action="/api/auth/verify-email" method="post">
          <input type="hidden" name="token" value={token} />
          <button className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-bold text-white">
            Confirm Email Address
          </button>
        </form>
      ) : (
        <p className="rounded-md border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          This confirmation link is incomplete. Request a new confirmation email.
        </p>
      )}
    </PasswordPageShell>
  );
}
