import React from 'react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import InventoryScreen from './components/InventoryScreen';

export default function InventoryManagementPage() {
  return (
    <AppLayout
      title="Inventory Management"
      subtitle="Add products, stock levels, pricing, barcode/SKU, variants, and vendors"
    >
      <PermissionGate permission="inventory">
        <InventoryScreen />
      </PermissionGate>
    </AppLayout>
  );
}
