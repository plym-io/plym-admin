import { cn } from '@/lib/classnames';

interface Props {
  sections: { id: string; title: string }[];
  active: string;
  onSelect: (id: string) => void;
  /** Unsaved edits per section, so a change is findable after you scroll away. */
  badges?: Record<string, number>;
}

/**
 * The settings screen's own navigation. A console with this many knobs needs
 * one page per concern rather than one very long page — and the count beside
 * a tab is the only way an edit two sections back stays visible.
 */
export function SettingsNav({ sections, active, onSelect, badges }: Props) {
  return (
    <nav
      aria-label="Settings sections"
      className="flex gap-1 overflow-x-auto md:sticky md:top-20 md:flex-col md:overflow-visible"
    >
      {sections.map((section) => {
        const count = badges?.[section.id] ?? 0;
        const selected = section.id === active;
        return (
          <button
            key={section.id}
            type="button"
            aria-current={selected ? 'page' : undefined}
            onClick={() => onSelect(section.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-[13.5px] font-medium transition-colors',
              selected
                ? 'bg-bg text-fg shadow-xs md:border md:border-border'
                : 'text-fg-muted hover:bg-bg-muted hover:text-fg',
            )}
          >
            <span className="truncate">{section.title}</span>
            {count > 0 && (
              <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-[10px] font-semibold text-accent-fg tnum">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
