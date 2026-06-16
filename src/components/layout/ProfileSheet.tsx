import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { api, call } from '@/api/client';
import { isApiError } from '@/api/errors';
import { useAuthStore } from '@/store/auth';
import { Sheet } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ProfileForm {
  display_name: string;
  bio: string;
  avatar_url: string;
}

/**
 * Edit your own profile via PATCH /api/users/me. Available to every role —
 * unlike user management, anyone can update their own details. On success we
 * sync the auth store so the rest of the app reflects the change immediately.
 */
export function ProfileSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { register, handleSubmit, reset, formState } = useForm<ProfileForm>();

  // Re-seed the form from the current user each time the sheet opens.
  useEffect(() => {
    if (open && user) {
      reset({
        display_name: user.display_name,
        bio: user.bio ?? '',
        avatar_url: user.avatar_url ?? '',
      });
    }
  }, [open, user, reset]);

  const submit = async (values: ProfileForm) => {
    try {
      const updated = await call(
        api.PATCH('/api/users/me', {
          body: {
            display_name: values.display_name,
            // Empty strings clear the optional fields.
            bio: values.bio.trim() || null,
            avatar_url: values.avatar_url.trim() || null,
          },
        }),
      );
      setUser(updated);
      toast.success('Profile updated.');
      onClose();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not update profile');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} label="Edit profile">
      <form onSubmit={handleSubmit(submit)} className="flex h-full flex-col">
        <div className="flex-1 space-y-5 p-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Edit profile</h2>
            <p className="mt-1 text-sm text-fg-muted">
              How you appear across this plym instance.
            </p>
          </div>
          <Field label="Display name">
            <Input
              autoFocus
              {...register('display_name', { required: true, maxLength: 120 })}
              placeholder="e.g. Sam Rivera"
            />
          </Field>
          <Field label="Bio">
            <textarea
              {...register('bio')}
              rows={4}
              placeholder="A short line about you…"
              className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-accent"
            />
          </Field>
          <Field label="Avatar URL">
            <Input
              type="url"
              {...register('avatar_url')}
              placeholder="https://…"
            />
          </Field>
        </div>
        <div className="flex gap-2 border-t border-border p-4">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="accent"
            disabled={formState.isSubmitting}
            className="flex-1"
          >
            {formState.isSubmitting ? 'Saving…' : 'Save profile'}
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
