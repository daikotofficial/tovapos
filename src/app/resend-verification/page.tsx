import PasswordPageShell from '@/components/auth/PasswordPageShell';

export default async function ResendVerificationPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <PasswordPageShell
      title="Resend confirmation email"
      description="Enter the email address used to register your TOVAPOS account."
    >
      <form action="/api/auth/resend-verification" method="post" className="space-y-4">
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Email Address</span>
          <input
            required
            type="email"
            name="email"
            autoComplete="email"
            className="h-12 w-full rounded-md border border-border bg-white px-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="you@business.com"
          />
        </label>
        {params?.error && (
          <p className="text-sm text-danger">
            The request could not be completed. Try again later.
          </p>
        )}
        <button className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-bold text-white">
          Send Confirmation Email
        </button>
      </form>
    </PasswordPageShell>
  );
}
