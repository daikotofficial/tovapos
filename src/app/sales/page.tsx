import React from 'react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import CheckoutScreen from '../components/CheckoutScreen';
import SalesShiftBar from '../components/SalesShiftBar';

export default function SalesCheckoutPage() {
  return (
    <AppLayout
      title="Sales / Checkout"
      subtitle="Scan barcode/SKU, sell products, and reduce stock instantly"
    >
      <PermissionGate permission="checkout">
        <div className="px-3 py-4 sm:p-6">
          <SalesShiftBar />
          <CheckoutScreen />
        </div>
      </PermissionGate>
    </AppLayout>
  );
}
