'use client';

import React from 'react';
import AppLogo from './AppLogo';

interface BrandLoaderProps {
  message?: string;
}

export default function BrandLoader({ message = 'Preparing TOVAPOS...' }: BrandLoaderProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f8f8] p-6">
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-primary/20 brand-loader-ring" />
          <div className="absolute inset-3 rounded-full bg-primary/10 brand-loader-glow" />
          <div className="relative brand-logo-swell">
            <AppLogo size={64} />
          </div>
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">TOVAPOS</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  );
}
