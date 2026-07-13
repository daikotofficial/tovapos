import React from 'react';
import { redirect } from 'next/navigation';
import AuthScreen from './components/AuthScreen';

type SignUpLoginPageProps = {
  searchParams?: Promise<{
    tab?: string | string[];
    authError?: string | string[];
    email?: string | string[];
    password?: string | string[];
  }>;
};

export default async function SignUpLoginPage({ searchParams }: SignUpLoginPageProps) {
  const params = await searchParams;
  if (params?.email !== undefined || params?.password !== undefined) {
    redirect('/sign-up-login');
  }
  const requestedTab = Array.isArray(params?.tab) ? params?.tab[0] : params?.tab;
  const requestedError = Array.isArray(params?.authError) ? params.authError[0] : params?.authError;
  const initialTab = requestedTab === 'signup' ? 'signup' : 'login';
  const initialError =
    requestedError === 'duplicate-email'
      ? 'This email is attached to more than one account. Contact an administrator to resolve the duplicate before signing in.'
      : requestedError === 'rate-limited'
        ? 'Too many sign-in attempts. Please try again later.'
        : requestedError === 'invalid'
          ? 'The email or password is incorrect. If you are new to TOVAPOS, select Register.'
          : requestedError === 'session'
            ? 'Your sign-in session could not be confirmed or has expired. Please sign in again and ensure cookies are enabled.'
            : requestedError === 'email-unverified'
              ? 'Confirm your email address before signing in. You can request a new confirmation email below.'
              : requestedError === 'registration'
                ? 'Registration could not be completed. Check the form and try again.'
                : '';

  return <AuthScreen initialTab={initialTab} initialError={initialError} />;
}
