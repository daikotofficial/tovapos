'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { usePosStore } from '@/lib/pos/PosStoreProvider';

interface LoginFormData {
  email: string;
  password: string;
  remember: boolean;
}

interface LoginFormProps {
  initialError?: string;
}

const labelClass = 'block text-sm font-semibold text-[#243b36] mb-1.5';
const inputClass =
  'auth-light-input h-12 w-full rounded-md border bg-white px-3 text-sm text-[#071412] caret-[#071412] placeholder:text-[#8b9a96] transition-all duration-150 [color-scheme:light] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

export default function LoginForm({ initialError = '' }: LoginFormProps) {
  const { signIn } = usePosStore();
  const [showPassword, setShowPassword] = useState(false);
  const [showResendLink, setShowResendLink] = useState(false);
  const [resendEmail, setResendEmail] = useState('');

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
      await signIn(data.email, data.password, data.remember);
      window.location.assign('/dashboard');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in';
      const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
      if (code === 'EMAIL_NOT_VERIFIED') {
        setResendEmail(data.email.trim());
        setShowResendLink(true);
      } else {
        setShowResendLink(false);
      }
      setError('email', {
        message,
      });
    }
  };

  return (
    <div className="fade-in">
      <div className="mb-5">
        <h2 className="text-2xl font-bold leading-tight text-[#071412]">Welcome back</h2>
        <p className="mt-1 text-sm text-[#66736f]">Sign in to continue to your workspace.</p>
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
        className="space-y-3.5"
      >
        {/* Email or phone */}
        <div>
          <label htmlFor="login-email" className={labelClass}>
            Email or phone
          </label>
          <input
            id="login-email"
            type="text"
            {...register('email', {
              required: 'Email or phone number is required',
            })}
            className={`${inputClass} ${
              errors.email
                ? 'border-danger focus:ring-danger/30 focus:border-danger'
                : 'border-border'
            }`}
            placeholder="you@business.com or 08012345678"
            autoComplete="username"
          />
          {errors.email && (
            <div className="mt-1.5 space-y-1.5">
              <p className="flex items-start gap-1 text-[11px] text-danger">
                {errors.email.message}
              </p>
              {showResendLink && resendEmail.includes('@') && (
                <Link
                  href={`/resend-verification?email=${encodeURIComponent(resendEmail)}`}
                  className="inline-flex text-xs font-semibold text-primary hover:underline"
                >
                  Resend confirmation email
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Password */}
        <div>
          <div className="mb-1.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <label htmlFor="login-password" className={labelClass}>
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
              className={`${inputClass} pr-10 ${
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5f6f6a] transition-colors duration-150 hover:text-[#071412]"
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
        <div className="flex items-center gap-2 rounded-md bg-[#f5f9f8] px-3 py-2">
          <input
            id="remember"
            type="checkbox"
            {...register('remember')}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
          />
          <label htmlFor="remember" className="cursor-pointer text-sm leading-5 text-[#5f6f6a]">
            Keep me signed in
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
              Sign in
            </>
          )}
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        New business?{' '}
        <Link href="/sign-up-login?tab=signup" className="text-primary font-medium hover:underline">
          Register your account
        </Link>
      </p>
    </div>
  );
}
