import React from 'react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import CheckoutScreen from '../components/CheckoutScreen';

export default function SalesCheckoutPage() {
  return (
    <AppLayout
      title="Sales / Checkout"
      subtitle="Scan barcode/SKU, sell products, and reduce stock instantly"
    >
      <PermissionGate permission="checkout">
        <CheckoutScreen />
      </PermissionGate>
    </AppLayout>
  );
}
