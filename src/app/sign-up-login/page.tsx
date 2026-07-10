import React from 'react';
import AuthScreen from './components/AuthScreen';

type SignUpLoginPageProps = {
  searchParams?: Promise<{
    tab?: string | string[];
  }>;
};

export default async function SignUpLoginPage({ searchParams }: SignUpLoginPageProps) {
  const params = await searchParams;
  const requestedTab = Array.isArray(params?.tab) ? params?.tab[0] : params?.tab;
  const initialTab = requestedTab === 'signup' ? 'signup' : 'login';

  return <AuthScreen initialTab={initialTab} />;
}
