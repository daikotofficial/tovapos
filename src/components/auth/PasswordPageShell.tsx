import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export default function PasswordPageShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7f6] px-4 py-10 text-[#071412]">
      <section className="w-full max-w-md rounded-xl border border-[#d7e2df] bg-white p-6 shadow-[0_18px_60px_rgba(7,20,18,0.10)] sm:p-8">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <Image src="/assets/brand/tovapos-mark.svg" alt="TOVAPOS" width={40} height={40} />
          <span className="font-bold">TOVAPOS</span>
        </Link>
        <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ShieldCheck size={20} />
        </div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-6">{children}</div>
        <Link
          href="/sign-up-login?tab=login"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft size={15} />
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
