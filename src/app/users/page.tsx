'use client';

import React, { useMemo, useState } from 'react';
import { ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import Modal from '@/components/ui/Modal';
import NiceSelect from '@/components/ui/NiceSelect';
import { confirmAction } from '@/components/ui/confirmAction';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { Permission, TovaUser, UserRole } from '@/lib/pos/types';
import { useRowsPerPage } from '@/lib/pos/useRowsPerPage';
import ListPagination from '@/components/ui/ListPagination';

const permissions: Permission[] = [
  'dashboard',
  'checkout',
  'add-product',
  'edit-product',
  'delete-product',
  'inventory',
  'adjust-stock',
  'give-discount',
  'void-sale',
  'reports',
  'credit-sales',
  'export-reports',
  'users',
  'settings',
  'customers',
  'vendors',
  'expenses',
  'refunds',
  'view-profit',
  'view-cost-price',
  'expiry-alerts',
  'manage-tax',
  'branches',
  'notifications',
  'categories',
  'expense-heads',
];

const permissionGroups: { title: string; items: Permission[] }[] = [
  {
    title: 'Dashboard & POS',
    items: ['dashboard', 'checkout', 'give-discount', 'void-sale', 'refunds'],
  },
  {
    title: 'Products & Stock',
    items: [
      'inventory',
      'add-product',
      'edit-product',
      'delete-product',
      'adjust-stock',
      'categories',
      'expiry-alerts',
    ],
  },
  { title: 'People & Suppliers', items: ['customers', 'vendors', 'users', 'branches'] },
  {
    title: 'Money & Reports',
    items: [
      'expenses',
      'expense-heads',
      'reports',
      'credit-sales',
      'export-reports',
      'view-profit',
      'view-cost-price',
    ],
  },
  { title: 'Settings & Control', items: ['settings', 'manage-tax', 'notifications'] },
];

const roles: UserRole[] = [
  'super-admin',
  'owner',
  'manager',
  'cashier',
  'inventory',
  'accountant',
  'expense-clerk',
  'auditor',
  'viewer',
];

const defaultPermissionsByRole: Record<UserRole, Permission[]> = {
  'super-admin': permissions,
  owner: permissions,
  manager: [
    'dashboard',
    'checkout',
    'add-product',
    'edit-product',
    'inventory',
    'adjust-stock',
    'give-discount',
    'void-sale',
    'reports',
    'export-reports',
    'customers',
    'vendors',
    'categories',
    'expense-heads',
    'expenses',
    'refunds',
    'view-profit',
    'view-cost-price',
    'expiry-alerts',
    'notifications',
    'categories',
  ],
  cashier: ['dashboard', 'checkout', 'customers', 'give-discount'],
  inventory: [
    'dashboard',
    'add-product',
    'edit-product',
    'inventory',
    'adjust-stock',
    'vendors',
    'reports',
    'expiry-alerts',
    'categories',
  ],
  accountant: [
    'dashboard',
    'reports',
    'export-reports',
    'expenses',
    'expense-heads',
    'view-profit',
  ],
  'expense-clerk': ['dashboard', 'expenses', 'expense-heads', 'reports'],
  auditor: ['dashboard', 'reports', 'export-reports', 'view-profit'],
  viewer: ['dashboard', 'reports'],
};

const permissionLabels: Record<Permission, string> = {
  dashboard: 'View dashboard',
  checkout: 'Sell product',
  'add-product': 'Add product',
  'edit-product': 'Edit product',
  'delete-product': 'Delete product',
  inventory: 'View inventory',
  'adjust-stock': 'Adjust stock',
  'give-discount': 'Give discount',
  'void-sale': 'Void sale',
  reports: 'View reports',
  'credit-sales': 'Reconcile credit sales',
  'export-reports': 'Export reports',
  users: 'Manage users',
  settings: 'Manage settings',
  customers: 'Manage customers',
  vendors: 'Manage suppliers',
  expenses: 'Manage expenses',
  refunds: 'Refund sale',
  'view-profit': 'View profit',
  'view-cost-price': 'View cost price',
  'expiry-alerts': 'Manage expiry alerts',
  'manage-tax': 'Manage VAT/tax',
  branches: 'Manage branches',
  notifications: 'Manage notifications',
  'sync-logs': 'Review sync logs',
  categories: 'Manage categories',
  'expense-heads': 'Manage expense heads',
};

function emptyUser(): TovaUser {
  return {
    id: `user-${Date.now()}`,
    name: '',
    email: '',
    role: 'cashier',
    permissions: defaultPermissionsByRole.cashier,
    status: 'active',
    pin: '',
    createdAt: new Date().toISOString(),
  };
}

export default function UsersPage() {
  const { users, upsertUser, deleteUser, pendingSyncCount, settings, currentUser } = usePosStore();
  const [editing, setEditing] = useState<TovaUser | null>(null);
  const [form, setForm] = useState<TovaUser>(emptyUser());
  const [loginPassword, setLoginPassword] = useState('');
  const [rowsPerPage] = useRowsPerPage();
  const [page, setPage] = useState(1);
  const canDeleteUsers = currentUser?.role === 'owner' || currentUser?.role === 'super-admin';

  const activeUsers = useMemo(
    () => users.filter((user) => user.status === 'active').length,
    [users]
  );
  const totalPages = Math.max(1, Math.ceil(users.length / rowsPerPage));
  const visibleUsers = users.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  React.useEffect(() => setPage(1), [rowsPerPage]);

  const openCreate = () => {
    const user = emptyUser();
    setForm(user);
    setEditing(user);
    setLoginPassword('');
  };

  const openEdit = (user: TovaUser) => {
    setForm(user);
    setEditing(user);
    setLoginPassword('');
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Full name is required.');
      return;
    }
    const isExisting = users.some((user) => user.id === form.id);
    if (!isExisting && loginPassword.length < 10) {
      toast.error('A login password of at least 10 characters is required.');
      return;
    }

    try {
      await upsertUser({
        ...form,
        email: form.email.trim().toLowerCase(),
        newPassword: loginPassword || undefined,
      });
      setEditing(null);
      setLoginPassword('');
      toast.success(isExisting ? 'User updated successfully.' : 'User added successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save user.');
    }
  };

  const removeUser = async (user: TovaUser) => {
    if (!canDeleteUsers) return;
    if (user.id === currentUser.id) return;
    const confirmed = await confirmAction({
      title: `Delete ${user.name}?`,
      description: 'This removes the user account and prevents that person from signing in again.',
      confirmLabel: 'Delete user',
    });
    if (!confirmed) return;
    try {
      await deleteUser(user.id);
      toast.success(`${user.name} was deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete user.');
    }
  };

  return (
    <AppLayout
      title="Users & Permissions"
      subtitle="Create users, assign roles, and control access"
    >
      <PermissionGate permission="users">
        <div className="mx-auto max-w-screen-2xl space-y-4 px-3 py-4 sm:space-y-5 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 shadow-card">
              <p className="text-xs text-muted-foreground uppercase font-semibold">Total Users</p>
              <p className="text-3xl font-bold mt-1">{users.length}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 shadow-card">
              <p className="text-xs text-muted-foreground uppercase font-semibold">Active Users</p>
              <p className="text-3xl font-bold mt-1 text-success">{activeUsers}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 shadow-card">
              <p className="text-xs text-muted-foreground uppercase font-semibold">
                Updates Waiting
              </p>
              <p className="text-3xl font-bold mt-1 text-warning">{pendingSyncCount}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card sm:rounded-xl">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-primary" />
                <span className="text-sm font-semibold">User Accounts</span>
              </div>
              <button
                onClick={openCreate}
                className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
              >
                <UserPlus size={14} />
                Add User
              </button>
            </div>

            <div className="overflow-x-auto overscroll-x-contain scrollbar-thin">
              <table className="w-full min-w-[860px]">
                <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Permissions</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{user.name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{user.email}</td>
                      <td className="px-4 py-3 capitalize">{user.role}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {user.permissions
                          .slice(0, 5)
                          .map((permission) => permissionLabels[permission])
                          .join(', ')}
                        {user.permissions.length > 5 ? ` +${user.permissions.length - 5} more` : ''}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            user.status === 'active'
                              ? 'bg-success/10 text-success'
                              : 'bg-danger/10 text-danger'
                          }`}
                        >
                          {user.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(user)}
                            className="text-sm font-semibold text-primary"
                          >
                            Edit
                          </button>
                          {canDeleteUsers && user.id !== currentUser?.id && (
                            <button
                              type="button"
                              onClick={() => removeUser(user)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-danger hover:bg-danger/10"
                              title="Delete user"
                            >
                              <Trash2 size={13} />
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination
              page={Math.min(page, totalPages)}
              totalItems={users.length}
              rowsPerPage={rowsPerPage}
              onPageChange={setPage}
            />
          </div>
        </div>

        <Modal
          open={!!editing}
          onClose={() => setEditing(null)}
          title={form.id && users.some((user) => user.id === form.id) ? 'Edit User' : 'Add User'}
          subtitle="Manage staff accounts, roles, and access permissions."
          footer={
            <>
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-lg bg-secondary text-sm"
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold"
              >
                Save User
              </button>
            </>
          }
        >
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Full Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Email</span>
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Phone</span>
              <input
                value={form.phone ?? ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Role</span>
              <NiceSelect
                value={form.role}
                onChange={(value) => {
                  const role = value as UserRole;
                  setForm({ ...form, role, permissions: defaultPermissionsByRole[role] });
                }}
                options={roles.map((role) => ({ value: role, label: role }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Assigned Branch</span>
              <NiceSelect
                value={form.branch ?? settings.branches?.[0] ?? 'Main Store'}
                onChange={(branch) => setForm({ ...form, branch })}
                options={(settings.branches ?? ['Main Store']).map((branch) => ({
                  value: branch,
                  label: branch,
                }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">
                {users.some((user) => user.id === form.id)
                  ? 'New Password (optional)'
                  : 'Login Password'}
              </span>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                placeholder="Minimum 10 characters"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Status</span>
              <NiceSelect
                value={form.status}
                onChange={(status) => setForm({ ...form, status: status as TovaUser['status'] })}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'suspended', label: 'Suspended' },
                ]}
              />
            </label>
          </div>

          <div className="mt-5">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Permissions</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, permissions })}
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, permissions: [] })}
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="space-y-4">
              {permissionGroups.map((group) => (
                <div key={group.title} className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">
                    {group.title}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {group.items.map((permission) => (
                      <label
                        key={permission}
                        className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(permission)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...form.permissions, permission]
                              : form.permissions.filter((item) => item !== permission);
                            setForm({ ...form, permissions: next });
                          }}
                        />
                        <span>{permissionLabels[permission]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      </PermissionGate>
    </AppLayout>
  );
}
