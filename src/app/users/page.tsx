'use client';

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Mail,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
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
  'view-only',
  'dashboard',
  'checkout',
  'add-product',
  'edit-product',
  'delete-product',
  'inventory',
  'adjust-stock',
  'stock-management',
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
  'warehouse-view',
  'warehouse-receive',
  'warehouse-process',
  'warehouse-dispatch',
  'warehouse-approve',
  'warehouse-receive-transfer',
  'warehouse-adjust',
  'sync-logs',
];

const permissionGroups: { title: string; items: Permission[] }[] = [
  {
    title: 'Read-only access',
    items: ['view-only'],
  },
  {
    title: 'Dashboard & POS',
    items: ['dashboard', 'checkout', 'credit-sales', 'give-discount', 'void-sale', 'refunds'],
  },
  {
    title: 'Products & Stock',
    items: [
      'inventory',
      'add-product',
      'edit-product',
      'delete-product',
      'adjust-stock',
      'stock-management',
      'categories',
      'expiry-alerts',
    ],
  },
  { title: 'People & Suppliers', items: ['customers', 'vendors', 'users', 'branches'] },
  {
    title: 'Inventory House',
    items: [
      'warehouse-view',
      'warehouse-receive',
      'warehouse-process',
      'warehouse-dispatch',
      'warehouse-approve',
      'warehouse-receive-transfer',
      'warehouse-adjust',
    ],
  },
  {
    title: 'Money & Reports',
    items: [
      'expenses',
      'expense-heads',
      'reports',
      'export-reports',
      'view-profit',
      'view-cost-price',
    ],
  },
  { title: 'Settings & Control', items: ['settings', 'manage-tax', 'notifications'] },
  { title: 'System Operations', items: ['sync-logs'] },
];

const hospitalityPermissions: Permission[] = [
  'dashboard',
  'reports',
  'users',
  'settings',
  'expenses',
  'expense-heads',
  'export-reports',
  'view-profit',
  'manage-tax',
  'branches',
  'notifications',
  'hospitality-reservations',
  'hospitality-rooms',
  'hospitality-guests',
  'hospitality-payments',
];

const hospitalityPermissionGroups: { title: string; items: Permission[] }[] = [
  {
    title: 'Front Office',
    items: ['dashboard', 'hospitality-reservations', 'hospitality-guests', 'hospitality-payments'],
  },
  { title: 'Rooms & Housekeeping', items: ['hospitality-rooms'] },
  {
    title: 'Finance & Reports',
    items: ['expenses', 'expense-heads', 'reports', 'export-reports', 'view-profit', 'manage-tax'],
  },
  { title: 'Administration', items: ['users', 'settings', 'branches', 'notifications'] },
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
  'custom',
];

const hospitalityRoles: UserRole[] = [
  'super-admin',
  'owner',
  'manager',
  'receptionist',
  'housekeeping',
  'booking-agent',
  'accountant',
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
    'stock-management',
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
    'warehouse-view',
    'warehouse-receive',
    'warehouse-process',
    'warehouse-dispatch',
    'warehouse-approve',
    'warehouse-receive-transfer',
    'warehouse-adjust',
  ],
  cashier: ['dashboard', 'checkout', 'customers', 'give-discount'],
  inventory: [
    'dashboard',
    'add-product',
    'edit-product',
    'inventory',
    'adjust-stock',
    'stock-management',
    'vendors',
    'reports',
    'expiry-alerts',
    'categories',
    'warehouse-view',
    'warehouse-receive',
    'warehouse-process',
    'warehouse-dispatch',
    'warehouse-receive-transfer',
    'warehouse-adjust',
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
  auditor: ['view-only'],
  viewer: ['dashboard', 'reports'],
  custom: [],
  receptionist: [
    'dashboard',
    'hospitality-reservations',
    'hospitality-guests',
    'hospitality-payments',
    'reports',
  ],
  housekeeping: ['dashboard', 'hospitality-rooms', 'hospitality-reservations'],
  'booking-agent': [
    'dashboard',
    'hospitality-reservations',
    'hospitality-guests',
    'hospitality-payments',
    'reports',
  ],
};

const hospitalityDefaultPermissions: Partial<Record<UserRole, Permission[]>> = {
  'super-admin': hospitalityPermissions,
  owner: hospitalityPermissions,
  manager: hospitalityPermissions,
  receptionist: defaultPermissionsByRole.receptionist,
  housekeeping: defaultPermissionsByRole.housekeeping,
  'booking-agent': defaultPermissionsByRole['booking-agent'],
  accountant: [
    'dashboard',
    'reports',
    'export-reports',
    'expenses',
    'expense-heads',
    'view-profit',
  ],
  auditor: ['dashboard', 'reports', 'export-reports', 'view-profit'],
  viewer: ['dashboard', 'reports'],
};

const permissionLabels: Record<Permission, string> = {
  'view-only': 'View-only access (no actions; reports can be downloaded)',
  dashboard: 'View dashboard',
  checkout: 'Sell product',
  'add-product': 'Add product',
  'edit-product': 'Edit product',
  'delete-product': 'Delete product',
  inventory: 'View inventory',
  'adjust-stock': 'Adjust stock',
  'stock-management': 'Open Stock Management',
  'give-discount': 'Give discount',
  'void-sale': 'Void sale',
  reports: 'View reports',
  'credit-sales': 'Sell on credit',
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
  'hospitality-reservations': 'Manage reservations',
  'hospitality-rooms': 'Manage rooms and services',
  'hospitality-guests': 'Manage guests',
  'hospitality-payments': 'Record guest payments',
  'warehouse-view': 'View Inventory House',
  'warehouse-receive': 'Receive goods into warehouse',
  'warehouse-process': 'Process and repackage goods',
  'warehouse-dispatch': 'Create and dispatch transfers',
  'warehouse-approve': 'Approve warehouse operations',
  'warehouse-receive-transfer': 'Receive store transfers',
  'warehouse-adjust': 'Adjust warehouse stock',
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
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rowsPerPage] = useRowsPerPage();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const canDeleteUsers = currentUser?.role === 'owner' || currentUser?.role === 'super-admin';
  const isHospitality = settings.businessMode === 'hospitality';
  const activePermissions = isHospitality ? hospitalityPermissions : permissions;
  const activePermissionGroups = isHospitality ? hospitalityPermissionGroups : permissionGroups;
  const availableRoles = isHospitality ? hospitalityRoles : roles;
  const permissionsForRole = (role: UserRole) =>
    (isHospitality ? hospitalityDefaultPermissions[role] : defaultPermissionsByRole[role]) ?? [];
  const roleLabels: Partial<Record<UserRole, string>> = {
    custom: 'Custom access',
    receptionist: 'Front Desk / Reception',
    housekeeping: 'Housekeeping',
    'booking-agent': 'Reservations Officer',
  };

  const activeUsers = useMemo(
    () => users.filter((user) => user.status === 'active').length,
    [users]
  );
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) =>
      [user.name, user.email, user.phone ?? '', user.role, user.status].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }, [search, users]);
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / rowsPerPage));
  const visibleUsers = filteredUsers.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [rowsPerPage]);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [search]);

  const openCreate = () => {
    const user = emptyUser();
    if (isHospitality) {
      user.role = 'receptionist';
      user.permissions = defaultPermissionsByRole.receptionist;
    }
    setForm(user);
    setEditing(user);
    setLoginPassword('');
    setShowLoginPassword(false);
  };

  const openEdit = (user: TovaUser) => {
    setForm(user);
    setEditing(user);
    setLoginPassword('');
    setShowLoginPassword(false);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Full name is required.');
      return;
    }
    if (!form.email.trim() && !form.phone?.trim()) {
      toast.error('Provide an email address or phone number so this user can sign in.');
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
      title={isHospitality ? 'Hospitality Team & Access' : 'Users & Permissions'}
      subtitle={
        isHospitality
          ? 'Manage front desk, reservations, housekeeping, and finance access'
          : 'Create users, assign roles, and control access'
      }
    >
      <PermissionGate permission="users">
        <div className="mx-auto max-w-[1480px] space-y-6 px-3 py-4 sm:px-6 sm:py-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="group rounded-2xl border border-border/80 bg-card p-5 shadow-card transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Total users
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                    {users.length}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Staff accounts in this workspace
                  </p>
                </div>
                <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Users size={18} />
                </span>
              </div>
            </div>
            <div className="group rounded-2xl border border-border/80 bg-card p-5 shadow-card transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Active users
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-success">
                    {activeUsers}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Currently able to sign in</p>
                </div>
                <span className="rounded-xl bg-success/10 p-2.5 text-success">
                  <CheckCircle2 size={18} />
                </span>
              </div>
            </div>
            <div className="group rounded-2xl border border-border/80 bg-card p-5 shadow-card transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Updates waiting
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-warning">
                    {pendingSyncCount}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Changes queued for sync</p>
                </div>
                <span className="rounded-xl bg-warning/10 p-2.5 text-warning">
                  <ShieldCheck size={18} />
                </span>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card">
            <div className="flex flex-col gap-4 border-b border-border/80 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <h2 className="text-base font-bold tracking-tight text-foreground">
                    User accounts
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Manage people, roles, and workspace access
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="relative block sm:w-64">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <span className="sr-only">Search users</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search users..."
                    className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </label>
                <button
                  onClick={openCreate}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <UserPlus size={16} />
                  Add user
                </button>
              </div>
            </div>

            <div className="overflow-x-auto overscroll-x-contain scrollbar-thin">
              <table className="w-full min-w-[1060px] table-fixed">
                <colgroup>
                  <col className="w-[21%]" />
                  <col className="w-[24%]" />
                  <col className="w-[15%]" />
                  <col className="w-[22%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                </colgroup>
                <thead className="border-b border-border/80 bg-muted/30 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3.5">User</th>
                    <th className="px-5 py-3.5">Contact</th>
                    <th className="px-5 py-3.5">Role</th>
                    <th className="px-5 py-3.5">Access</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {visibleUsers.map((user) => (
                    <tr key={user.id} className="group transition-colors hover:bg-primary/[0.025]">
                      <td className="px-5 py-4 align-middle">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {user.name
                              .split(/\s+/)
                              .map((part) => part[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase() || '?'}
                          </span>
                          <span className="min-w-0 truncate font-semibold text-foreground">
                            {user.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                          <Mail size={14} className="shrink-0 text-muted-foreground/70" />
                          <span className="truncate">
                            {user.email || user.phone || 'No contact added'}
                          </span>
                        </div>
                        {user.email && user.phone && (
                          <p className="mt-1 truncate pl-6 text-xs text-muted-foreground/70">
                            {user.phone}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <span className="inline-flex max-w-full items-center truncate rounded-lg bg-muted px-2.5 py-1 text-xs font-bold capitalize text-foreground">
                          {roleLabels[user.role] ?? user.role}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <div className="flex flex-wrap gap-1.5">
                          {user.permissions.slice(0, 2).map((permission) => (
                            <span
                              key={permission}
                              className="max-w-[145px] truncate rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground"
                            >
                              {permissionLabels[permission]}
                            </span>
                          ))}
                          {user.permissions.length > 2 && (
                            <span className="rounded-md bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">
                              +{user.permissions.length - 2} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold capitalize ${
                            user.status === 'active'
                              ? 'bg-success/10 text-success'
                              : 'bg-danger/10 text-danger'
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {user.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          <button
                            onClick={() => openEdit(user)}
                            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-primary transition hover:border-primary/30 hover:bg-primary/5"
                          >
                            Edit
                          </button>
                          {canDeleteUsers && user.id !== currentUser?.id && (
                            <button
                              type="button"
                              onClick={() => removeUser(user)}
                              className="inline-flex items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 text-xs font-bold text-danger transition hover:border-danger/20 hover:bg-danger/10"
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
            {filteredUsers.length === 0 && (
              <div className="px-6 py-14 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Search size={18} />
                </div>
                <p className="mt-3 text-sm font-semibold">No users found</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try a different name, email, role, or status.
                </p>
              </div>
            )}
            <ListPagination
              page={Math.min(page, totalPages)}
              totalItems={filteredUsers.length}
              rowsPerPage={rowsPerPage}
              onPageChange={setPage}
            />
          </div>
        </div>

        <Modal
          open={!!editing}
          onClose={() => setEditing(null)}
          title={form.id && users.some((user) => user.id === form.id) ? 'Edit User' : 'Add User'}
          subtitle="Create a secure staff account and choose exactly what they can access."
          size="xl"
          footer={
            <>
              <button
                onClick={() => setEditing(null)}
                className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90"
              >
                Save User
              </button>
            </>
          }
        >
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/[0.035] p-4">
            <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <UserPlus size={18} />
            </span>
            <div>
              <p className="text-sm font-bold">Account details</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Use a work email or phone number for sign-in.
              </p>
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-bold text-foreground">
                Full name <span className="text-danger">*</span>
              </span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-foreground">
                Email (optional if phone is provided)
              </span>
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-foreground">
                Phone <span className="font-normal text-muted-foreground">(alternative login)</span>
              </span>
              <input
                value={form.phone ?? ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-foreground">Role</span>
              <NiceSelect
                value={form.role}
                onChange={(value) => {
                  const role = value as UserRole;
                  setForm({ ...form, role, permissions: permissionsForRole(role) });
                }}
                options={availableRoles.map((role) => ({
                  value: role,
                  label: roleLabels[role] ?? role,
                }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-foreground">Assigned branch</span>
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
              <span className="text-xs font-bold text-foreground">
                {users.some((user) => user.id === form.id)
                  ? 'New Password (optional)'
                  : 'Login Password'}
              </span>
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 pr-10 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                  placeholder="Minimum 10 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label={showLoginPassword ? 'Hide login password' : 'Show login password'}
                >
                  {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-foreground">Status</span>
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

          <div className="mt-7 border-t border-border/80 pt-6">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-foreground">Permissions</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Choose the tools and data this person can use.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, permissions: activePermissions })}
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
              {activePermissionGroups.map((group) => (
                <div
                  key={group.title}
                  className="rounded-2xl border border-border/80 bg-muted/15 p-4"
                >
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    {group.title}
                  </p>
                  <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                    {group.items.map((permission) => (
                      <label
                        key={permission}
                        className="flex items-center gap-3 rounded-xl border border-transparent bg-card px-3 py-2.5 text-sm transition hover:border-primary/20 hover:bg-primary/[0.03]"
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
                        <span className="leading-snug">{permissionLabels[permission]}</span>
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
