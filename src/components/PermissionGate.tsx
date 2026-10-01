'use client';

import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { Permission } from '@/lib/pos/types';

interface PermissionGateProps {
  permission: Permission | Permission[];
  children: React.ReactNode;
}

export default function PermissionGate({ permission, children }: PermissionGateProps) {
  const { hasPermission, currentUser } = usePosStore();
  const permissions = Array.isArray(permission) ? permission : [permission];
  if (permissions.some((item) => hasPermission(item))) return <>{children}</>;
  const permissionLabel = permissions.length === 1 ? permissions[0] : permissions.join(' or ');

  return (
    <div className="px-3 py-4 sm:p-6">
      <div className="mx-auto max-w-xl rounded-xl border border-warning/30 bg-warning/10 p-5 text-warning">
        <div className="flex items-start gap-3">
          <ShieldAlert size={22} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Permission required</p>
            <p className="mt-1 text-sm leading-6">
              {currentUser?.name ?? 'This user'} does not have the {permissionLabel} permission. Ask an
              owner or manager to update the role in Users & Permissions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
