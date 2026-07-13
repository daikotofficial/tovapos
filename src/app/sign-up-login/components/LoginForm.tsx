'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { usePosStore } from '@/lib/pos/PosStoreProvider';

interface LoginFormData {
  email: string;
  password: string;
  remember: boolean;
}

interface LoginFormProps {
  initialError?: string;
}

export default function LoginForm({ initialError = '' }: LoginFormProps) {
  const { signIn } = usePosStore();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    defaultValues: {
      remember: false,
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      const user = await signIn(data.email, data.password, data.remember);
      toast.success(`Signed in as ${user.name}`);
      window.location.assign('/dashboard');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in';
      setError('email', {
        message,
      });
    }
  };

  return (
    <div className="fade-in">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase text-[#128174]">Secure access</p>
        <h2 className="mt-2 text-2xl font-bold leading-tight text-[#071412]">Sign in to TOVAPOS</h2>
        <p className="mt-2 text-sm leading-6 text-[#66736f]">
          Access your business sales, inventory, reports, and team controls.
        </p>
      </div>

      {initialError && (
        <p className="mb-4 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-sm leading-6 text-danger">
          {initialError}
        </p>
      )}

      <form
        action="/api/auth/login"
        method="post"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        {/* Email */}
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-foreground mb-1.5">
            Email Address
          </label>
          <input
            id="login-email"
            type="email"
            {...register('email', {
              required: 'Email address is required',
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Enter a valid email address',
              },
            })}
            className={`h-12 w-full rounded-md border bg-white px-3 text-sm transition-all duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 ${
              errors.email
                ? 'border-danger focus:ring-danger/30 focus:border-danger'
                : 'border-border'
            }`}
            placeholder="you@business.com"
            autoComplete="email"
          />
          {errors.email && (
            <p className="text-[11px] text-danger mt-1.5 flex items-start gap-1">
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <div className="mb-1.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <label htmlFor="login-password" className="block text-sm font-medium text-foreground">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 10, message: 'Password must be at least 10 characters' },
              })}
              className={`h-12 w-full rounded-md border bg-white px-3 pr-10 text-sm transition-all duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                errors.password
                  ? 'border-danger focus:ring-danger/30 focus:border-danger'
                  : 'border-border'
              }`}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-150"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && (
            <p className="text-[11px] text-danger mt-1.5">{errors.password.message}</p>
          )}
        </div>

        {/* Remember me */}
        <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2">
          <input
            id="remember"
            type="checkbox"
            {...register('remember')}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
          />
          <label
            htmlFor="remember"
            className="cursor-pointer text-sm leading-5 text-muted-foreground"
          >
            Stay signed in for 14 days (otherwise, 8 hours)
          </label>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-bold text-white transition-all duration-150 hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              <LogIn size={16} />
              Sign In to TOVAPOS
            </>
          )}
        </button>
      </form>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Email not confirmed?{' '}
        <Link href="/resend-verification" className="font-medium text-primary hover:underline">
          Resend confirmation
        </Link>
      </p>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        New business?{' '}
        <Link href="/sign-up-login?tab=signup" className="text-primary font-medium hover:underline">
          Register your account
        </Link>
      </p>
    </div>
  );
}
