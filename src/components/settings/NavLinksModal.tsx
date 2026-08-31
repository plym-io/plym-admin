import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowElbowDownRight,
  ArrowUp,
  CaretDown,
  ListDashes,
  Plus,
  Trash,
} from '@phosphor-icons/react';
import {
  NAV_SLOTS,
  NAV_SLOT_LABEL,
  addChild,
  editAt,
  faultCount,
  faultOf,
  isMenu,
  moveAt,
  newDraft,
  readDrafts,
  removeAt,
  toLinks,
  toYaml,
  type NavDraft,
  type NavDrafts,
  type NavPath,
  type NavSlot,
} from '@/lib/nav-links';
import { cn } from '@/lib/classnames';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Snippet } from '@/components/cloud/Snippet';

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

/** What a submenu turns into once the template renders it. */
const MENU_NOUN: Record<NavSlot, string> = {
  header: 'dropdown',
  footer: 'column',
};

const SLOT_BLURB: Record<NavSlot, string> = {
  header: 'Sits beside the blog name, at the top of every page.',
  footer: 'Sits above the “Powered by plym” line, at the foot of every page.',
};

const FAULT_HINT: Record<'text' | 'url', string> = {
  text: 'Give this one a label.',
  url: 'Add where it goes, or nest a link under it to make it a menu.',
};

interface RowProps {
  item: NavDraft;
  slot: NavSlot;
  path: NavPath;
  position: number;
  count: number;
  onEdit: (path: NavPath, patch: Partial<Omit<NavDraft, 'id'>>) => void;
  onMove: (path: NavPath, delta: -1 | 1) => void;
  onRemove: (path: NavPath) => void;
  onNest?: () => void;
}

function Row({
  item,
  slot,
  path,
  position,
  count,
  onEdit,
  onMove,
  onRemove,
  onNest,
}: RowProps) {
  const nested = path.length === 2;
  const menu = isMenu(item);
  const fault = faultOf(item);
  const [label, address] = (nested ? CHILD_EXAMPLES : EXAMPLES[slot])[
    position % (nested ? CHILD_EXAMPLES : EXAMPLES[slot]).length
  ];
  // Named by the whole path, not by the position in its own list: every menu
  // has a first child, and "Sub-link 1" would be the name of all of them.
  const where = nested
    ? `Link ${path[0] + 1} sub-link ${position + 1}`
    : `Link ${position + 1}`;

  return (
    <div className={cn('px-3 py-2.5', nested && 'pl-9')}>
      <div className="flex items-start gap-2">
        {nested && (
          <ArrowElbowDownRight
            size={14}
            className="mt-2.5 shrink-0 text-fg-subtle"
            aria-hidden="true"
          />
        )}

        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
          <Input
            value={item.text}
            aria-label={`${where} label`}
            placeholder={label}
            onChange={(e) => onEdit(path, { text: e.target.value })}
          />
          {menu ? (
            <p className="flex h-9 items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-[13px] text-fg-subtle">
              <CaretDown size={13} aria-hidden="true" />
              Opens a {MENU_NOUN[slot]}
            </p>
          ) : (
            <Input
              value={item.url}
              aria-label={`${where} address`}
              placeholder={address}
              onChange={(e) => onEdit(path, { url: e.target.value })}
            />
          )}
        </div>

        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Move ${where.toLowerCase()} up`}
            disabled={position === 0}
            onClick={() => onMove(path, -1)}
          >
            <ArrowUp size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Move ${where.toLowerCase()} down`}
            disabled={position === count - 1}
            onClick={() => onMove(path, 1)}
          >
            <ArrowDown size={14} />
          </Button>
          {onNest && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Add a sub-link under ${item.text.trim() || where.toLowerCase()}`}
              title={`Nest a link under this one — it becomes a ${MENU_NOUN[slot]}`}
              onClick={onNest}
            >
              <ArrowElbowDownRight size={14} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${where.toLowerCase()}`}
            className="hover:text-danger"
            onClick={() => onRemove(path)}
          >
            <Trash size={14} />
          </Button>
        </div>
      </div>

      {fault && (
        <p className={cn('mt-1.5 text-[12px] text-fg-subtle', nested && 'ml-6')}>
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
 * The builder for the `links:` block: two lists of rows, one level of nesting,
 * and the YAML underneath updating as they are typed.
 *
 * It ends in a block to paste rather than a Save, because this screen is
 * read-only on purpose — config.yaml on the server is the one copy of the
 * truth, and a form that wrote a second one from here is exactly what that
 * decision was avoiding. What the builder is for is the part that is genuinely
 * awkward to hand-write: the nesting, the indentation, and the labels that
 * YAML would otherwise read back as numbers or booleans.
 */
export function NavLinksModal({ open, onClose, links }: Props) {
  const [drafts, setDrafts] = useState<NavDrafts>(() => readDrafts(links));
  const [slot, setSlot] = useState<NavSlot>('header');

  // Opening is what seeds the form. Editing and then closing without pasting
  // has to leave nothing behind — the blog is unchanged, so the next open
  // must show the blog, not the abandoned draft.
  useEffect(() => {
    if (!open) return;
    setDrafts(readDrafts(links));
    setSlot('header');
  }, [open, links]);

  const items = drafts[slot];
  const faults = faultCount(drafts.header) + faultCount(drafts.footer);
  const yaml = useMemo(
    () => toYaml({ header: toLinks(drafts.header), footer: toLinks(drafts.footer) }),
    [drafts],
  );

  const apply = (fn: (list: NavDraft[]) => NavDraft[]) =>
    setDrafts((d) => ({ ...d, [slot]: fn(d[slot]) }));

  return (
    <Modal open={open} onClose={onClose} label="Header and footer links" className="max-w-3xl">
      <div className="flex max-h-[85vh] flex-col">
        <div className="border-b border-border px-5 py-4 pr-14">
          <h2 className="text-[15px] font-semibold tracking-tight text-fg">
            Header &amp; footer links
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
            Build the navigation, then paste the block into <code>config.yaml</code>. A link
            either goes somewhere or opens a menu of links that do.
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
              <p className="mt-2 text-[13.5px] text-fg">Nothing in the {slot} yet.</p>
              <p className="mt-1 text-[12.5px] text-fg-muted">
                {slot === 'header'
                  ? 'The header shows just the blog name until you add one.'
                  : 'The footer shows just the blog name until you add one.'}
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
                    count={items.length}
                    onEdit={(path, patch) => apply((l) => editAt(l, path, patch))}
                    onMove={(path, delta) => apply((l) => moveAt(l, path, delta))}
                    onRemove={(path) => apply((l) => removeAt(l, path))}
                    onNest={() => apply((l) => addChild(l, i))}
                  />
                  {item.children.map((child, j) => (
                    <Row
                      key={child.id}
                      item={child}
                      slot={slot}
                      path={[i, j]}
                      position={j}
                      count={item.children.length}
                      onEdit={(path, patch) => apply((l) => editAt(l, path, patch))}
                      onMove={(path, delta) => apply((l) => moveAt(l, path, delta))}
                      onRemove={(path) => apply((l) => removeAt(l, path))}
                    />
                  ))}
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

          <div className="border-t border-border px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              config.yaml
            </p>
            {faults > 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-4 text-center text-[13px] text-fg-muted">
                {faults === 1 ? 'One link is' : `${faults} links are`} unfinished. The block
                appears once every row has a label and somewhere to go — a blog will not start
                on a half-written one.
              </p>
            ) : (
              <>
                <Snippet className="mt-2" code={yaml} />
                <p className="mt-2 text-[12.5px] text-fg-muted">
                  Paste it into <code>config.yaml</code>, replacing any existing{' '}
                  <code>links:</code> block, then run <code>plym rebuild</code>.
                </p>
              </>
            )}
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
