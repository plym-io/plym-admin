import { useEffect, useState } from 'react';
import { ArrowElbowDownRight, DotsSixVertical, ListDashes, Plus, Trash } from '@phosphor-icons/react';
import {
  NAV_SLOTS,
  NAV_SLOT_LABEL,
  addChild,
  editAt,
  faultOf,
  isMenu,
  moveAt,
  moveTo,
  newDraft,
  readDrafts,
  removeAt,
  setKind,
  type NavDraft,
  type NavDrafts,
  type NavFault,
  type NavKind,
  type NavPath,
  type NavSlot,
} from '@/lib/nav-links';
import { cn } from '@/lib/classnames';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Placeholders that spell out the two shapes a row can take, rather than
 * naming the field twice. They cycle by position so a fresh list reads like
 * the example in the docs instead of three identical grey "Label" boxes.
 */
const EXAMPLES: Record<NavSlot, [string, string][]> = {
  header: [
    ['Home', '/'],
    ['Blog', '/blog'],
    ['Pricing', 'https://example.com/pricing'],
  ],
  footer: [
    ['About', '/about'],
    ['Contact', '/contact'],
    ['Privacy', 'https://example.com/privacy'],
  ],
};

const CHILD_EXAMPLES: [string, string][] = [
  ['Getting started', '/docs/getting-started'],
  ['Changelog', '/changelog'],
  ['API reference', 'https://example.com/api'],
];

const SLOT_BLURB: Record<NavSlot, string> = {
  header: 'Sits beside the blog name, at the top of every page. A menu opens as a dropdown.',
  footer:
    'Sits above the “Powered by plym” line. Menus become titled columns; plain links sit in a row beneath them.',
};

const FAULT_HINT: Record<NavFault, string> = {
  text: 'Give this one a label.',
  url: 'Add where it goes.',
  menu: 'A menu needs at least one link under it.',
  // The label is the key this row is written under, so a repeat is not a
  // duplicate in the file — it is the one entry that survives it.
  duplicate: 'Another link here has this label. Two of them become one.',
};

/** True when two rows sit in the same list, which is as far as a drag can go. */
function sameList(a: NavPath, b: NavPath): boolean {
  return a.length === b.length && (a.length === 1 || a[0] === b[0]);
}

function KindToggle({
  kind,
  label,
  onChange,
}: {
  kind: NavKind;
  label: string;
  onChange: (kind: NavKind) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`${label} kind`}
      className="flex h-9 shrink-0 items-center gap-0.5 rounded-md border border-border bg-bg-subtle p-0.5"
    >
      {(['link', 'menu'] as NavKind[]).map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={k === kind}
          onClick={() => onChange(k)}
          className={cn(
            'rounded px-2.5 py-1 text-[12px] font-medium capitalize transition-colors',
            k === kind ? 'bg-bg text-fg shadow-xs' : 'text-fg-muted hover:text-fg',
          )}
        >
          {k === 'link' ? 'Link' : 'Menu'}
        </button>
      ))}
    </div>
  );
}

interface RowProps {
  item: NavDraft;
  slot: NavSlot;
  path: NavPath;
  position: number;
  /** The list this row sits in — a repeated label is only a clash within it. */
  siblings: NavDraft[];
  dragging: NavPath | null;
  over: boolean;
  onEdit: (path: NavPath, patch: Partial<Omit<NavDraft, 'id'>>) => void;
  onMove: (path: NavPath, delta: -1 | 1) => void;
  onRemove: (path: NavPath) => void;
  onKind?: (kind: NavKind) => void;
  onDragFrom: (path: NavPath | null) => void;
  onDragOver: (path: NavPath | null) => void;
  onDrop: (path: NavPath) => void;
}

function Row({
  item,
  slot,
  path,
  position,
  siblings,
  dragging,
  over,
  onEdit,
  onMove,
  onRemove,
  onKind,
  onDragFrom,
  onDragOver,
  onDrop,
}: RowProps) {
  // `draggable` is armed by the handle rather than left on: a row that is
  // always draggable swallows text selection inside its own inputs.
  const [armed, setArmed] = useState(false);
  const nested = path.length === 2;
  const menu = isMenu(item);
  const fault = faultOf(item, siblings);
  const examples = nested ? CHILD_EXAMPLES : EXAMPLES[slot];
  const [label, address] = examples[position % examples.length];
  // Named by the whole path, not by the position in its own list: every menu
  // has a first child, and "Sub-link 1" would be the name of all of them.
  const where = nested
    ? `Link ${path[0] + 1} sub-link ${position + 1}`
    : `Link ${position + 1}`;
  const droppable =
    dragging !== null && sameList(dragging, path) && dragging.join() !== path.join();

  return (
    <div
      draggable={armed}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        // Firefox starts no drag at all without payload on the transfer.
        e.dataTransfer.setData('text/plain', item.id);
        onDragFrom(path);
      }}
      onDragEnd={() => {
        setArmed(false);
        onDragFrom(null);
      }}
      onDragOver={(e) => {
        if (!droppable) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(path);
      }}
      onDragLeave={() => droppable && onDragOver(null)}
      onDrop={(e) => {
        if (!droppable) return;
        e.preventDefault();
        onDrop(path);
      }}
      className={cn(
        'px-3 py-2.5 transition-colors',
        nested && 'pl-9',
        over && 'bg-accent/5 ring-1 ring-inset ring-accent/40',
        dragging?.join() === path.join() && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={`Reorder ${where.toLowerCase()}`}
          title="Drag to reorder, or focus this and use the arrow keys"
          onPointerDown={() => setArmed(true)}
          onPointerUp={() => setArmed(false)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            onMove(path, e.key === 'ArrowUp' ? -1 : 1);
          }}
          className="mt-1 shrink-0 cursor-grab rounded p-1 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg active:cursor-grabbing"
        >
          <DotsSixVertical size={15} weight="bold" />
        </button>

        {nested && (
          <ArrowElbowDownRight
            size={14}
            className="mt-2.5 shrink-0 text-fg-subtle"
            aria-hidden="true"
          />
        )}

        <div
          className={cn(
            'grid min-w-0 flex-1 gap-2',
            menu ? 'sm:grid-cols-1' : 'sm:grid-cols-2',
          )}
        >
          <Input
            value={item.text}
            aria-label={`${where} label`}
            placeholder={label}
            onChange={(e) => onEdit(path, { text: e.target.value })}
          />
          {!menu && (
            <Input
              value={item.url}
              aria-label={`${where} address`}
              placeholder={address}
              onChange={(e) => onEdit(path, { url: e.target.value })}
            />
          )}
        </div>

        {onKind && (
          <KindToggle kind={item.kind} label={where} onChange={onKind} />
        )}

        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remove ${where.toLowerCase()}`}
          className="shrink-0 hover:text-danger"
          onClick={() => onRemove(path)}
        >
          <Trash size={14} />
        </Button>
      </div>

      {fault && (
        <p className={cn('mt-1.5 pl-7 text-[12px] text-fg-subtle', nested && 'pl-13')}>
          {FAULT_HINT[fault]}
        </p>
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** `links` exactly as `/api/config` served it. */
  links: unknown;
}

/**
 * The header and footer navigation: two lists of rows, one level of nesting,
 * a Link/Menu toggle and drag to reorder.
 *
 * There is no Save. Settings on a self-hosted blog are read-only, the same as
 * every other panel on this screen — this dialog is where the shape of the
 * navigation is laid out and read, not where the blog is written to.
 */
export function NavLinksModal({ open, onClose, links }: Props) {
  const [drafts, setDrafts] = useState<NavDrafts>(() => readDrafts(links));
  const [slot, setSlot] = useState<NavSlot>('header');
  const [dragging, setDragging] = useState<NavPath | null>(null);
  const [over, setOver] = useState<NavPath | null>(null);

  // Opening is what seeds the form. The blog is unchanged either way, so the
  // next open must show the blog, not the draft left behind last time.
  useEffect(() => {
    if (!open) return;
    setDrafts(readDrafts(links));
    setSlot('header');
    setDragging(null);
    setOver(null);
  }, [open, links]);

  const items = drafts[slot];

  const apply = (fn: (list: NavDraft[]) => NavDraft[]) =>
    setDrafts((d) => ({ ...d, [slot]: fn(d[slot]) }));

  const drop = (to: NavPath) => {
    const from = dragging;
    setDragging(null);
    setOver(null);
    if (from) apply((l) => moveTo(l, from, to.length === 2 ? to[1] : to[0]));
  };

  const rowProps = (path: NavPath) => ({
    dragging,
    over: over?.join() === path.join(),
    onEdit: (p: NavPath, patch: Partial<Omit<NavDraft, 'id'>>) =>
      apply((l) => editAt(l, p, patch)),
    onMove: (p: NavPath, delta: -1 | 1) => apply((l) => moveAt(l, p, delta)),
    onRemove: (p: NavPath) => apply((l) => removeAt(l, p)),
    onDragFrom: setDragging,
    onDragOver: setOver,
    onDrop: drop,
  });

  return (
    <Modal open={open} onClose={onClose} label="Header and footer links" className="max-w-3xl">
      <div className="flex max-h-[85vh] flex-col">
        <div className="border-b border-border px-5 py-4 pr-14">
          <h2 className="text-[15px] font-semibold tracking-tight text-fg">
            Header &amp; footer links
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
            A link either goes somewhere or opens a menu of links that do. Drag a row by
            its handle to reorder it.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Which navigation"
          className="flex gap-1 border-b border-border px-4 py-2"
        >
          {NAV_SLOTS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={s === slot}
              onClick={() => setSlot(s)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                s === slot
                  ? 'bg-bg text-fg shadow-xs'
                  : 'text-fg-muted hover:bg-bg-muted hover:text-fg',
              )}
            >
              {NAV_SLOT_LABEL[s]}
              <span className="text-[11px] tabular-nums text-fg-subtle">
                {drafts[s].length}
              </span>
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="px-5 pt-3 text-[12.5px] text-fg-subtle">{SLOT_BLURB[slot]}</p>

          {items.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <ListDashes size={22} className="mx-auto text-fg-subtle" aria-hidden="true" />
              <p className="mt-2 text-[13.5px] text-fg">
                Nothing in the {slot} yet.
              </p>
              <p className="mt-1 text-[12.5px] text-fg-muted">
                The {slot} shows just the blog name until you add one.
              </p>
            </div>
          ) : (
            <div className="mt-2 divide-y divide-border">
              {items.map((item, i) => (
                <div key={item.id}>
                  <Row
                    item={item}
                    slot={slot}
                    path={[i]}
                    position={i}
                    siblings={items}
                    onKind={(kind) => apply((l) => setKind(l, i, kind))}
                    {...rowProps([i])}
                  />
                  {isMenu(item) && (
                    <>
                      {item.children.map((child, j) => (
                        <Row
                          key={child.id}
                          item={child}
                          slot={slot}
                          path={[i, j]}
                          position={j}
                          siblings={item.children}
                          {...rowProps([i, j])}
                        />
                      ))}
                      <div className="pb-2 pl-16">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => apply((l) => addChild(l, i))}
                        >
                          <Plus size={13} /> Add a link to{' '}
                          {item.text.trim() || 'this menu'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="px-4 py-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => apply((l) => [...l, newDraft()])}
            >
              <Plus size={14} /> Add {items.length ? 'another' : 'a'} link
            </Button>
          </div>

        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
