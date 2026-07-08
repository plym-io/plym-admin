import { useEffect, useState } from 'react';
import { Archive, Trash } from '@phosphor-icons/react';
import type { PostListItem } from '@/types';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

interface Props {
  post: PostListItem | null;
  onClose: () => void;
  onDelete: (post: PostListItem) => void;
  onArchive: (post: PostListItem) => void;
}

/** Destructive confirm: the user must type DELETE, with Archive offered as the safe way out. */
export function DeletePostModal({ post, onClose, onDelete, onArchive }: Props) {
  const [text, setText] = useState('');
  const armed = text.trim() === 'DELETE';

  // Reset the confirmation input each time the modal opens for a post.
  useEffect(() => {
    if (post) setText('');
  }, [post]);

  return (
    <Modal open={!!post} onClose={onClose} label="Delete post">
      {post && (
        <div className="p-6">
          <h2 className="pr-8 text-lg font-semibold tracking-tight text-fg">
            Delete “{post.title}”?
          </h2>
          <p className="mt-1.5 text-sm text-fg-muted">
            This action is irreversible. Do you want to Archive this post
            instead?
          </p>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-muted px-3 py-2.5">
            <p className="text-[13px] text-fg-muted">
              Archived posts are unpublished but kept safe.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0"
              onClick={() => {
                onArchive(post);
                onClose();
              }}
            >
              <Archive size={15} /> Archive
            </Button>
          </div>

          <label
            htmlFor="confirm-delete-post"
            className="mt-5 block text-[13px] text-fg-muted"
          >
            To delete permanently, type{' '}
            <span className="font-mono font-semibold text-fg">DELETE</span>{' '}
            below.
          </label>
          <input
            id="confirm-delete-post"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && armed) {
                onDelete(post);
                onClose();
              }
            }}
            placeholder="DELETE"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="mt-1.5 h-9 w-full rounded-md border border-border bg-bg px-3 font-mono text-sm transition-colors hover:border-border-strong focus:border-danger focus:outline-none"
          />

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="dangerSolid"
              disabled={!armed}
              onClick={() => {
                onDelete(post);
                onClose();
              }}
            >
              <Trash size={16} /> Delete post
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
