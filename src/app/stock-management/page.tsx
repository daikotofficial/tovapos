import React from 'react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import StockManagementScreen from './components/StockManagementScreen';

export default function StockManagementPage() {
  return (
    <AppLayout title="Stock Management" subtitle="Receive products, manage batches, update stock, and process returns">
      <PermissionGate permission="adjust-stock">
        <StockManagementScreen />
      </PermissionGate>
    </AppLayout>
  );
}
