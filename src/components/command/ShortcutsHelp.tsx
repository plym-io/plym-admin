import { useUiStore } from '@/store/ui';
import { Sheet } from '@/components/ui/sheet';
import { Kbd } from '@/components/ui/kbd';

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Global',
    items: [
      ['mod+k', 'Open command palette'],
      ['mod+n', 'New post'],
      ['mod+b', 'Toggle sidebar'],
      ['?', 'This help'],
    ],
  },
  {
    title: 'Editor',
    items: [
      ['mod+s', 'Save & refresh rendered file'],
      ['mod+enter', 'Publish / unpublish'],
      ['mod+/', 'Open preview in a new tab'],
    ],
  },
];

export function ShortcutsHelp() {
  const open = useUiStore((s) => s.shortcutsOpen);
  const setOpen = useUiStore((s) => s.setShortcutsOpen);

  return (
    <Sheet open={open} onClose={() => setOpen(false)} label="Keyboard shortcuts">
      <div className="p-6">
        <h2 className="text-lg font-semibold tracking-tight">
          Keyboard shortcuts
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          plym is built for the keyboard. These work from anywhere.
        </p>
        <div className="mt-6 space-y-6">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                {g.title}
              </p>
              <div className="space-y-1">
                {g.items.map(([keys, label]) => (
                  <div
                    key={keys}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-bg-muted"
                  >
                    <span className="text-sm text-fg">{label}</span>
                    <Kbd keys={keys} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
