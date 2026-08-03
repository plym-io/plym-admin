import {
  Code,
  LinkSimple,
  Table,
  TextB,
  TextItalic,
  TextStrikethrough,
  UploadSimple,
  type Icon,
} from '@phosphor-icons/react';
import { BOLD, CODE, ITALIC, STRIKE } from './format-commands';
import { cn } from '@/lib/classnames';

export interface EditorActions {
  inline: (mark: string) => void;
  link: () => void;
  upload: () => void;
  table: () => void;
}

/**
 * The formatting bar above the writing surface. Everything here is also a "/"
 * command or a shortcut — it's here so you don't have to know that.
 *
 * It is a contained bar rather than a rule across the column: the writing area
 * is inset from the page, so a bare `border-b` began and ended in mid-air with
 * the buttons hanging off its left edge. Boxing it gives the controls an
 * enclosure of their own and keeps them clear of the prose below.
 */
export function FormatToolbar({ actions }: { actions: EditorActions }) {
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="mb-3 flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-bg-subtle px-1.5 py-1 shadow-xs"
    >
      <ToolButton
        icon={TextB}
        label="Bold"
        keys="mod+b"
        onClick={() => actions.inline(BOLD)}
      />
      <ToolButton
        icon={TextItalic}
        label="Italic"
        keys="mod+i"
        onClick={() => actions.inline(ITALIC)}
      />
      <ToolButton
        icon={TextStrikethrough}
        label="Strikethrough"
        onClick={() => actions.inline(STRIKE)}
      />
      <ToolButton
        icon={Code}
        label="Code"
        onClick={() => actions.inline(CODE)}
      />
      <Divider />
      <ToolButton icon={LinkSimple} label="Link" onClick={actions.link} />
      <ToolButton icon={Table} label="Table" onClick={actions.table} />
      <ToolButton
        icon={UploadSimple}
        label="Upload an image"
        onClick={actions.upload}
      />
      <span className="ml-auto hidden pr-1.5 text-[11px] text-fg-subtle sm:inline">
        Type{' '}
        <kbd className="rounded border border-border bg-bg px-1 font-mono text-[10.5px] text-fg-muted">
          /
        </kbd>{' '}
        for more
      </span>
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px shrink-0 bg-border" />;
}

function ToolButton({
  icon: Glyph,
  label,
  keys,
  onClick,
  className,
}: {
  icon: Icon;
  label: string;
  keys?: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={keys ? `${label} (${keys.replace('mod', '⌘/Ctrl')})` : label}
      aria-label={label}
      // The selection is the input here — never take focus off it.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg hover:text-fg hover:shadow-xs',
        className,
      )}
    >
      <Glyph size={16} />
    </button>
  );
}

/** Same actions, as a list — shared with the right-click menu. */
export const MENU_ITEMS: {
  id: string;
  label: string;
  icon: Icon;
  keys?: string;
  run: (a: EditorActions) => void;
}[] = [
  { id: 'bold', label: 'Bold', icon: TextB, keys: 'mod+b', run: (a) => a.inline(BOLD) },
  {
    id: 'italic',
    label: 'Italic',
    icon: TextItalic,
    keys: 'mod+i',
    run: (a) => a.inline(ITALIC),
  },
  {
    id: 'strike',
    label: 'Strikethrough',
    icon: TextStrikethrough,
    run: (a) => a.inline(STRIKE),
  },
  { id: 'code', label: 'Code', icon: Code, run: (a) => a.inline(CODE) },
  { id: 'link', label: 'Link', icon: LinkSimple, run: (a) => a.link() },
];
