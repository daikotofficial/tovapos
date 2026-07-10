'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Loader2, CheckCircle2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePosStore } from '@/lib/pos/PosStoreProvider';

interface SignupFormData {
  businessName: string;
  licenseNumber: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
}

interface SignupFormProps {
  onSwitchToLogin: () => void;
}

export default function SignupForm({ onSwitchToLogin }: SignupFormProps) {
  const router = useRouter();
  const { registerBusiness, isHydrated } = usePosStore();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<SignupFormData>();

  const password = watch('password');

  const onSubmit = async (data: SignupFormData) => {
    if (!isHydrated) {
      toast.error('Local database is still loading. Try again in a moment.');
      return;
    }

    try {
      await registerBusiness({
        businessName: data.businessName,
        registrationNumber: data.licenseNumber,
        ownerName: data.ownerName,
        email: data.email,
        phone: data.phone,
        address: data.address,
        password: data.password,
      });
      toast.success(`${data.businessName} is ready. You are signed in as owner.`);
      router.push('/dashboard');
    } catch (error) {
      setError('email', {
        message: error instanceof Error ? error.message : 'Unable to register business',
      });
    }
  };

  const inputClass = (hasError: boolean) =>
    `h-11 w-full rounded-md border bg-white px-3 text-sm transition-all duration-150 focus:outline-none focus:ring-2 ${
      hasError
        ? 'border-danger focus:ring-danger/30 focus:border-danger'
        : 'border-border focus:ring-primary/30 focus:border-primary'
    }`;
  const labelClass = 'block text-sm font-medium text-foreground mb-1.5';
  const errorClass = 'text-[11px] text-danger mt-1.5';

  if (isSubmitSuccessful) {
    return (
      <div className="flex flex-col items-center text-center py-8 gap-4 fade-in">
        <div className="w-16 h-16 rounded-md bg-success/10 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-success" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-foreground">Registration Submitted</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Your business workspace has been created locally. Backend activation can be connected
            later.
          </p>
        </div>
        <button
          onClick={onSwitchToLogin}
          className="h-11 rounded-md bg-primary px-6 text-sm font-bold text-white transition-all duration-150 hover:bg-primary/90 active:scale-95"
        >
          Back to Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase text-[#128174]">Business setup</p>
        <h2 className="mt-2 text-2xl font-bold leading-tight text-[#071412]">
          Register your business
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#66736f]">
          Create the workspace your store team will use for sales, stock, and reports.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Section: Business Info */}
        <div className="space-y-3 rounded-md border border-[#dfe7e4] bg-[#f8fbfa] p-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={14} className="text-primary" />
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Business Information
            </p>
          </div>

          <div>
            <label htmlFor="businessName" className={labelClass}>
              Business Name <span className="text-danger">*</span>
            </label>
            <input
              id="businessName"
              {...register('businessName', { required: 'Business name is required' })}
              className={inputClass(!!errors.businessName)}
              placeholder="e.g. TOVA Supermarket"
            />
            {errors.businessName && <p className={errorClass}>{errors.businessName.message}</p>}
          </div>

          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="licenseNumber" className={labelClass}>
                Registration / Tax ID
              </label>
              <p className="mb-1 min-h-5 text-[10px] leading-5 text-muted-foreground">
                Optional business registration reference
              </p>
              <input
                id="licenseNumber"
                {...register('licenseNumber', {
                  required: false,
                })}
                className={`${inputClass(!!errors.licenseNumber)} font-mono`}
                placeholder="PH-2026-00000"
              />
              {errors.licenseNumber && <p className={errorClass}>{errors.licenseNumber.message}</p>}
            </div>
            <div className="sm:pt-5">
              <label htmlFor="phone" className={labelClass}>
                Business Phone <span className="text-danger">*</span>
              </label>
              <input
                id="phone"
                type="tel"
                {...register('phone', { required: 'Phone number is required' })}
                className={inputClass(!!errors.phone)}
                placeholder="(555) 000-0000"
              />
              {errors.phone && <p className={errorClass}>{errors.phone.message}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="address" className={labelClass}>
              Street Address
            </label>
            <input
              id="address"
              {...register('address')}
              className={inputClass(false)}
              placeholder="123 Medical Plaza, Suite 100"
            />
          </div>
        </div>

        {/* Section: Account Owner */}
        <div className="space-y-3 rounded-md border border-[#dfe7e4] bg-[#f8fbfa] p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Account Owner</p>

          <div>
            <label htmlFor="ownerName" className={labelClass}>
              Full Name <span className="text-danger">*</span>
            </label>
            <input
              id="ownerName"
              {...register('ownerName', { required: 'Owner name is required' })}
              className={inputClass(!!errors.ownerName)}
              placeholder="Dr. Jane Smith"
            />
            {errors.ownerName && <p className={errorClass}>{errors.ownerName.message}</p>}
          </div>

          <div>
            <label htmlFor="signup-email" className={labelClass}>
              Work Email <span className="text-danger">*</span>
            </label>
            <input
              id="signup-email"
              type="email"
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
              })}
              className={inputClass(!!errors.email)}
              placeholder="owner@yourbusiness.com"
            />
            {errors.email && <p className={errorClass}>{errors.email.message}</p>}
          </div>

          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-5 text-primary">
            This first account is created as the business owner. You can add cashiers, inventory
            users, managers, auditors, and expense clerks after signing in.
          </div>
        </div>

        {/* Section: Password */}
        <div className="space-y-3 rounded-md border border-[#dfe7e4] bg-[#f8fbfa] p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Set Password</p>

          <div>
            <label htmlFor="signup-password" className={labelClass}>
              Password <span className="text-danger">*</span>
            </label>
            <p className="mb-1 text-[10px] leading-5 text-muted-foreground">
              Minimum 8 characters with uppercase, number, and symbol
            </p>
            <div className="relative">
              <input
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                {...register('password', {
                  required: 'Password is required',
                  minLength: { value: 8, message: 'Minimum 8 characters' },
                  pattern: {
                    value: /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/,
                    message: 'Must include uppercase, number, and symbol (!@#$%^&*)',
                  },
                })}
                className={`${inputClass(!!errors.password)} pr-10`}
                placeholder="••••••••"
                autoComplete="new-password"
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
            {errors.password && <p className={errorClass}>{errors.password.message}</p>}
          </div>

          <div>
            <label htmlFor="confirmPassword" className={labelClass}>
              Confirm Password <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                {...register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: (v) => v === password || 'Passwords do not match',
                })}
                className={`${inputClass(!!errors.confirmPassword)} pr-10`}
                placeholder="••••••••"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-150"
                aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className={errorClass}>{errors.confirmPassword.message}</p>
            )}
          </div>
        </div>

        {/* Terms */}
        <div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md bg-muted/50 px-3 py-2">
            <input
              type="checkbox"
              {...register('agreeTerms', { required: 'You must accept the terms to continue' })}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
            />
            <span className="text-xs text-muted-foreground leading-relaxed">
              I agree to the{' '}
              <button type="button" className="text-primary font-medium hover:underline">
                Terms of Service
              </button>{' '}
              and{' '}
              <button type="button" className="text-primary font-medium hover:underline">
                Privacy Policy
              </button>
              . I confirm this business is authorized to operate and manage sales records.
            </span>
          </label>
          {errors.agreeTerms && <p className={errorClass}>{errors.agreeTerms.message}</p>}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting || !isHydrated}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-bold text-white transition-all duration-150 hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              <CheckCircle2 size={16} />
              {isHydrated ? 'Register Business' : 'Loading local database...'}
            </>
          )}
        </button>
      </form>

      <p className="text-center text-xs text-muted-foreground mt-4">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-primary font-medium hover:underline"
        >
          Sign in instead
        </button>
      </p>
    </div>
  );
}
