import { useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  ArrowsClockwise,
  Trash,
  Eye,
  EyeSlash,
  Check,
  LinkSimple,
} from '@phosphor-icons/react';
import type { PostListItem } from '@/types';
import { STATUS_META } from '@/components/ui/status';
import { ConfirmButton } from '@/components/ui/confirm';
import { shortDate, hostname } from '@/lib/format';
import { cn } from '@/lib/classnames';

interface Props {
  post: PostListItem;
  onTogglePublish: (post: PostListItem) => void;
  onRefresh: (post: PostListItem) => Promise<void>;
  onDelete: (post: PostListItem) => void;
}

export function PostRow({ post, onTogglePublish, onRefresh, onDelete }: Props) {
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const meta = STATUS_META[post.status];
  const isPublished = post.status === 'published';

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh(post);
      setRefreshed(true);
      setTimeout(() => setRefreshed(false), 1200);
    } finally {
      setRefreshing(false);
    }
  };

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => navigate(`/posts/${post.id}`)}
      className="group relative flex cursor-pointer items-center gap-4 rounded-lg border border-transparent px-3 py-3 transition-colors hover:border-border hover:bg-bg-subtle"
    >
      {/* Status strip */}
      <span
        className={cn('h-9 w-1 shrink-0 rounded-full', meta.strip)}
        aria-hidden
      />

      {/* Title + excerpt */}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[15px] font-semibold leading-tight text-fg">
          <span className="truncate">{post.title}</span>
          {post.canonical_url && (
            <span
              className="flex shrink-0 items-center text-fg-muted"
              title={`Canonical URL: ${hostname(post.canonical_url)}`}
            >
              <LinkSimple size={14} weight="regular" />
            </span>
          )}
        </p>
        {post.excerpt && (
          <p className="mt-0.5 truncate text-sm text-fg-muted">
            {post.excerpt}
          </p>
        )}
      </div>

      {/* Meta */}
      <div className="hidden shrink-0 flex-col items-end text-right text-xs text-fg-subtle tnum sm:flex">
        <span>{shortDate(post.updated_at)}</span>
        <span>{post.reading_time} min read</span>
      </div>

      {/* Hover actions */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <ConfirmButton
          icon={isPublished ? EyeSlash : Eye}
          label={isPublished ? 'Unpublish' : 'Publish'}
          question={
            isPublished
              ? 'Move this post back to draft?'
              : 'Publish this post now?'
          }
          confirmLabel={isPublished ? 'Unpublish' : 'Publish'}
          onConfirm={() => onTogglePublish(post)}
        />
        <button
          onClick={stop(handleRefresh)}
          title="Refresh rendered file"
          aria-label="Refresh rendered file"
          className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
        >
          {refreshed ? (
            <Check size={16} className="text-success" />
          ) : (
            <ArrowsClockwise
              size={16}
              className={cn(refreshing && 'animate-spin')}
            />
          )}
        </button>
        <ConfirmButton
          icon={Trash}
          label="Delete"
          question={`Delete "${post.title}"? You'll have a few seconds to undo.`}
          confirmLabel="Delete"
          tone="danger"
          onConfirm={() => onDelete(post)}
        />
      </div>
    </motion.div>
  );
}
