import React from 'react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import WarehouseScreen from './WarehouseScreen';

export default function WarehousePage() {
  return (
    <AppLayout
      title="Inventory House"
      subtitle="Receive, release, transfer, and audit stock across locations"
    >
      <PermissionGate permission="warehouse-view">
        <WarehouseScreen />
      </PermissionGate>
    </AppLayout>
  );
}
