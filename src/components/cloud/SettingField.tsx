import { humanKey } from '@/lib/settings';
import { cn } from '@/lib/classnames';
import type { SettingSchema } from '@/types/cloud';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';
import { ImpactBadge } from './ImpactBadge';

interface Props {
  field: SettingSchema;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
  /** Choices for the `template` key, which the settings document supplies. */
  templates: string[];
  /** Edited, not yet deployed. */
  dirty: boolean;
}

const selectClass =
  'h-9 w-full rounded-md border border-border bg-bg px-2.5 text-sm text-fg transition-colors hover:border-border-strong focus:border-accent focus:outline-none';

/**
 * One editable setting, drawn from the gateway's own description of it. Nothing
 * here knows a key name — `kind` picks the control, and a kind we've never seen
 * still gets a text box rather than disappearing from the form.
 */
export function SettingField({ field, value, onChange, templates, dirty }: Props) {
  const { key, kind } = field;
  const options = field.choices ?? (key === 'template' ? templates : undefined);
  const stacked = kind === 'html';

  const control = (() => {
    if (kind === 'bool' || typeof value === 'boolean') {
      return (
        <div className="flex h-9 items-center">
          <Toggle
            checked={value === true}
            onChange={onChange}
            label={field.label ?? humanKey(key)}
          />
        </div>
      );
    }
    const text = String(value);

    if (options?.length) {
      return (
        <select value={text} onChange={(e) => onChange(e.target.value)} className={selectClass}>
          {/* A value the deployment no longer offers still has to be shown,
              or the form would silently propose changing it. */}
          {!options.includes(text) && text !== '' && <option value={text}>{text}</option>}
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }

    if (kind === 'color') {
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`${humanKey(key)} colour`}
            value={/^#[0-9a-f]{6}$/i.test(text) ? text : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-bg p-1"
          />
          <Input
            value={text}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            className="font-mono text-[13px]"
          />
        </div>
      );
    }

    if (kind === 'html') {
      return (
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          spellCheck={false}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-[12.5px] leading-relaxed text-fg transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
        />
      );
    }

    return (
      <Input
        value={text}
        inputMode={kind === 'int' ? 'numeric' : undefined}
        placeholder={kind === 'list' ? 'comma separated' : undefined}
        spellCheck={kind === 'line'}
        onChange={(e) => onChange(e.target.value)}
        className={kind === 'url' || kind === 'path' ? 'font-mono text-[13px]' : undefined}
      />
    );
  })();

  return (
    <div
      className={cn(
        'gap-x-6 gap-y-2 px-4 py-3',
        stacked ? 'block' : 'grid grid-cols-[minmax(0,1fr)_minmax(0,20rem)] items-start',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <label className="text-[13.5px] font-medium text-fg">
            {field.label ?? humanKey(key)}
          </label>
          {dirty && <ImpactBadge impact={field.impact} />}
        </div>
        <p className="mt-0.5 font-mono text-[11.5px] text-fg-subtle">{key}</p>
        {field.note && <p className="mt-1 text-[13px] text-fg-muted">{field.note}</p>}
        {dirty &&
          field.effects.map((e) => (
            <p key={e} className="mt-1 text-[12.5px] text-fg-muted">
              {e}
            </p>
          ))}
      </div>
      <div className={cn('min-w-0', stacked && 'mt-2')}>{control}</div>
    </div>
  );
}
