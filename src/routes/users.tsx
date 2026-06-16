import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Plus, Key, Prohibit, ArrowCounterClockwise } from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { isApiError } from '@/api/errors';
import { useAuthStore } from '@/store/auth';
import type { Role, User } from '@/types';
import { Page, PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { ConfirmButton } from '@/components/ui/confirm';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/classnames';

const ROLE_STYLE: Record<Role, string> = {
  administrator: 'bg-accent-soft text-accent',
  editor: 'bg-bg-muted text-fg-muted',
  reader: 'bg-bg-muted text-fg-subtle',
};

type Tab = 'active' | 'deactivated';
const TABS: { value: Tab; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'deactivated', label: 'Deactivated' },
];

interface NewUser {
  email: string;
  display_name: string;
  password: string;
  role: Role;
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function Users() {
  const me = useAuthStore((s) => s.user);
  // Readers and editors can view this page; only admins get management actions.
  const isAdmin = me?.role === 'administrator';
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<Tab>('active');

  useEffect(() => {
    call(api.GET('/api/users', { params: { query: { page: 1, page_size: 200 } } }))
      .then((p) => setUsers(p.items))
      .catch((e) => toast.error(isApiError(e) ? e.message : 'Could not load users'))
      .finally(() => setLoading(false));
  }, []);

  const deactivatedCount = useMemo(
    () => users.filter((u) => !u.is_active).length,
    [users],
  );
  const visible = useMemo(
    () => users.filter((u) => (tab === 'active' ? u.is_active : !u.is_active)),
    [users, tab],
  );

  const resetPassword = async (user: User) => {
    const pw = crypto.randomUUID().slice(0, 12);
    try {
      await call(
        api.POST('/api/users/{user_id}/reset-password', {
          params: { path: { user_id: user.id } },
          body: { new_password: pw },
        }),
      );
      navigator.clipboard.writeText(pw).catch(() => {});
      toast.success('New password copied to clipboard.', {
        description: `Share it with ${user.display_name} securely.`,
      });
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not reset password');
    }
  };

  const deactivate = async (user: User) => {
    try {
      await call(
        api.DELETE('/api/users/{user_id}/deactivate', {
          params: { path: { user_id: user.id } },
        }),
      );
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: false } : u)),
      );
      toast.success(`${user.display_name} deactivated.`);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not deactivate user');
    }
  };

  const reactivate = async (user: User) => {
    try {
      const updated = await call(
        api.POST('/api/users/{user_id}/reactivate', {
          params: { path: { user_id: user.id } },
        }),
      );
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
      toast.success(`${user.display_name} reactivated.`);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not reactivate user');
    }
  };

  return (
    <Page width="text">
      <PageHeader
        title="Users"
        description="People with access to this plym instance."
        actions={
          isAdmin ? (
            <Button variant="accent" onClick={() => setCreating(true)}>
              <Plus size={16} weight="bold" /> New user
            </Button>
          ) : undefined
        }
      />

      <div className="mt-6 flex items-center gap-1 rounded-md bg-bg-muted p-0.5">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'rounded px-3 py-1 text-sm transition-colors',
              tab === t.value
                ? 'bg-bg text-fg shadow-xs'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
            {t.value === 'deactivated' && deactivatedCount > 0 && (
              <span className="ml-1.5 text-fg-subtle">{deactivatedCount}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-10 text-center text-sm text-fg-muted">
          {tab === 'deactivated'
            ? 'No deactivated users.'
            : 'No active users.'}
        </p>
      ) : (
        <div className="mt-4 divide-y divide-border rounded-lg border border-border">
          {visible.map((u) => (
            <div
              key={u.id}
              className={cn(
                'group flex items-center gap-3 px-4 py-3',
                !u.is_active && 'opacity-60',
              )}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-muted text-xs font-semibold text-fg-muted">
                {initials(u.display_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">
                  {u.display_name}
                  {u.id === me?.id && (
                    <span className="ml-2 text-xs font-normal text-fg-subtle">
                      you
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-fg-muted">{u.email}</p>
              </div>
              <span
                className={cn(
                  'rounded-pill px-2 py-0.5 text-xs font-medium capitalize',
                  ROLE_STYLE[u.role],
                )}
              >
                {u.role}
              </span>
              {isAdmin && (
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {u.is_active ? (
                    <>
                      <ConfirmButton
                        icon={Key}
                        label="Reset password"
                        question={`Reset ${u.display_name}'s password? A new one is generated and copied to your clipboard.`}
                        confirmLabel="Reset"
                        tone="danger"
                        stopPropagation={false}
                        onConfirm={() => void resetPassword(u)}
                      />
                      {u.id !== me?.id && (
                        <ConfirmButton
                          icon={Prohibit}
                          label="Deactivate"
                          question={`Deactivate ${u.display_name}? They'll lose access until reactivated.`}
                          confirmLabel="Deactivate"
                          tone="danger"
                          stopPropagation={false}
                          onConfirm={() => void deactivate(u)}
                        />
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      title="Reactivate"
                      aria-label="Reactivate"
                      onClick={() => void reactivate(u)}
                      className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
                    >
                      <ArrowCounterClockwise size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <NewUserSheet
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(u) => setUsers((prev) => [u, ...prev])}
        />
      )}
    </Page>
  );
}

function NewUserSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (u: User) => void;
}) {
  const { register, handleSubmit, reset, formState } = useForm<NewUser>({
    defaultValues: { role: 'editor' },
  });

  const submit = async (values: NewUser) => {
    try {
      const created = await call(api.POST('/api/users', { body: values }));
      onCreated(created);
      toast.success('Welcome to the team.', {
        description: `${created.display_name} can sign in now.`,
      });
      reset({ role: 'editor' });
      onClose();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not create user');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} label="New user">
      <form onSubmit={handleSubmit(submit)} className="flex h-full flex-col">
        <div className="flex-1 space-y-5 p-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">New user</h2>
            <p className="mt-1 text-sm text-fg-muted">
              They'll sign in with this email and password.
            </p>
          </div>
          <Field label="Display name">
            <Input
              autoFocus
              {...register('display_name', { required: true })}
              placeholder="e.g. Sam Rivera"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              {...register('email', { required: true })}
              placeholder="name@example.com"
            />
          </Field>
          <Field label="Temporary password">
            <Input
              type="text"
              {...register('password', { required: true, minLength: 8 })}
              placeholder="At least 8 characters"
            />
          </Field>
          <Field label="Role">
            <select
              {...register('role')}
              className="h-9 w-full rounded-md border border-border bg-bg px-3 text-sm capitalize outline-none transition-colors hover:border-border-strong focus:border-accent"
            >
              <option value="editor">Editor</option>
              <option value="administrator">Administrator</option>
              <option value="reader">Reader</option>
            </select>
          </Field>
        </div>
        <div className="flex gap-2 border-t border-border p-4">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
            Keep editing
          </Button>
          <Button
            type="submit"
            variant="accent"
            disabled={formState.isSubmitting}
            className="flex-1"
          >
            {formState.isSubmitting ? 'Creating…' : 'Add user'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-fg-muted">{label}</span>
      {children}
    </label>
  );
}
