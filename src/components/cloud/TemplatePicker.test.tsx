import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { TemplatePicker, fetchedNames, shelve } from './TemplatePicker';
import type { TemplateCatalog } from '@/types/cloud';

const catalog = (over: Partial<TemplateCatalog> = {}): TemplateCatalog => ({
  available: [],
  active: null,
  public: [],
  private: [],
  ...over,
});

describe('shelve', () => {
  it('splits the two registries the gateway publishes', () => {
    const shelf = shelve(catalog({ public: ['atlas', 'quill'], private: ['acme'] }), '', []);
    expect(shelf.public).toEqual(['atlas', 'quill']);
    expect(shelf.private).toEqual(['acme']);
  });

  it('never offers the same name in both lists', () => {
    // A name in both is the tenant's own copy: that is the one they control,
    // and the section a row sits in is the registry it installs from.
    const shelf = shelve(catalog({ public: ['shared'], private: ['shared'] }), '', []);
    expect(shelf.public).toEqual([]);
    expect(shelf.private).toEqual(['shared']);
  });

  it('shows the live template when neither registry offers it any more', () => {
    // Otherwise the one row that must be on this screen — the template the
    // blog is actually rendering — is the row missing from it.
    expect(shelve(catalog({ public: ['atlas'] }), 'retired', []).public).toEqual([
      'atlas',
      'retired',
    ]);
  });

  it('leaves a live private template in the private list', () => {
    const shelf = shelve(catalog({ private: ['acme'] }), 'acme', []);
    expect(shelf.public).toEqual([]);
    expect(shelf.private).toEqual(['acme']);
  });

  it('falls back to the settings document when there is no catalogue', () => {
    // An older gateway has no /templates. Switching must still work.
    expect(shelve(null, 'atlas', ['atlas', 'quill'])).toEqual({
      public: ['atlas', 'quill'],
      private: [],
    });
  });

  it('lets the catalogue overrule the settings document', () => {
    expect(shelve(catalog({ public: ['atlas'] }), '', ['stale']).public).toEqual(['atlas']);
  });

  it('sorts both lists so neither reorders between polls', () => {
    const shelf = shelve(
      catalog({ public: ['zed', 'minimal'], private: ['second', 'first'] }),
      '',
      [],
    );
    expect(shelf.public).toEqual(['minimal', 'zed']);
    expect(shelf.private).toEqual(['first', 'second']);
  });

  it('has nothing to show for a tenant with no registry folder', () => {
    expect(shelve(catalog({ public: ['atlas'], private: [] }), '', []).private).toEqual([]);
  });
});

describe('fetchedNames', () => {
  it('counts a template the settings document says is selectable', () => {
    // Only a template whose files are already here can be switched to in one
    // operation; anything else pays for a fetch first.
    expect(fetchedNames(null, ['atlas']).has('atlas')).toBe(true);
  });

  it('takes both the catalogue and the settings document', () => {
    expect([...fetchedNames(catalog({ available: ['atlas'] }), ['default'])].sort()).toEqual([
      'atlas',
      'default',
    ]);
  });

  it('does not count a template only a registry offers', () => {
    expect(fetchedNames(catalog({ public: ['quill'] }), []).has('quill')).toBe(false);
  });
});

const getTemplates = vi.fn();
const installTemplate = vi.fn();
const applySettings = vi.fn();
const getOpEvents = vi.fn();

vi.mock('@/api/cloud', () => ({
  getTemplates: () => getTemplates(),
  installTemplate: (...args: unknown[]) => installTemplate(...args),
  applySettings: (...args: unknown[]) => applySettings(...args),
  getOpEvents: (...args: unknown[]) => getOpEvents(...args),
}));

const success = vi.fn();
const error = vi.fn();
const plain = vi.fn();

vi.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]) => plain(...args), {
    success: (...args: unknown[]) => success(...args),
    error: (...args: unknown[]) => error(...args),
  }),
}));

const accepted = (opId: string) => ({ op_id: opId, verb: 'x', target: null, state: 'queued' });
const finished = (opId: string, state = 'succeeded') => ({
  op_id: opId,
  events: [],
  next_after: 0,
  state,
});

const open = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  getTemplates.mockReset().mockResolvedValue(
    catalog({ available: ['atlas', 'quill'], active: 'atlas', public: ['atlas', 'quill', 'zed'] }),
  );
  installTemplate.mockReset().mockResolvedValue(accepted('op-install'));
  applySettings.mockReset().mockResolvedValue(accepted('op-switch'));
  getOpEvents.mockReset().mockResolvedValue(finished('op'));
  success.mockReset();
  error.mockReset();
  plain.mockReset();
  open.mockReset();
  window.open = open;
});

afterEach(() => {
  vi.useRealTimers();
});

/** Let the catalogue land, then run the op poll for `times` seconds. */
const settle = (times = 3) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(times * 1000);
  });

const paint = async (live = 'atlas', installed = ['atlas', 'quill']) => {
  render(<TemplatePicker installed={installed} live={live} onChanged={vi.fn()} />);
  await act(async () => {});
};

const clickInstall = async (name: string) => {
  const row = screen.getByText(name).closest('div')!;
  const button = row.querySelector('button')!;
  await act(async () => {
    button.click();
  });
};

describe('TemplatePicker', () => {
  it('lists each registry under its own heading', async () => {
    getTemplates.mockResolvedValue(
      catalog({ available: ['atlas'], active: 'atlas', public: ['atlas'], private: ['acme'] }),
    );
    await paint();

    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Private registry')).toBeInTheDocument();
    expect(screen.getByText('acme')).toBeInTheDocument();
  });

  it('says nothing about a private registry the tenant has not got', async () => {
    await paint();
    expect(screen.queryByText('Private registry')).not.toBeInTheDocument();
  });

  it('leaves nothing to press on the template already live', async () => {
    await paint();

    const row = screen.getByText('atlas').closest('div')!;
    expect(row.querySelector('button')).toBeDisabled();
    expect(screen.getByText('Live')).toBeInTheDocument();
    // The next row along is the whole point of the screen.
    expect(screen.getByText('quill').closest('div')!.querySelector('button')).toBeEnabled();
  });

  it('switches straight to a template the blog already holds', async () => {
    await paint();
    await clickInstall('quill');
    await settle();

    // Its files are here: fetching them again would be a second restart for
    // nothing.
    expect(installTemplate).not.toHaveBeenCalled();
    expect(applySettings).toHaveBeenCalledWith({ template: 'quill' });
  });

  it('fetches a template the blog has not got, then makes it live', async () => {
    await paint();
    await clickInstall('zed');
    await settle();

    expect(installTemplate).toHaveBeenCalledWith('zed', 'public');
    expect(applySettings).toHaveBeenCalledWith({ template: 'zed' });
  });

  it('offers the blog itself once the template is live', async () => {
    await paint();
    await clickInstall('quill');
    await settle();

    expect(success).toHaveBeenCalledWith('Template updated.', expect.anything());
    const options = success.mock.calls[0][1] as { action: { label: string; onClick: () => void } };
    expect(options.action.label).toBe('View site');
    options.action.onClick();
    expect(open).toHaveBeenCalledWith('/', '_blank', 'noopener,noreferrer');
  });

  it('does not switch the blog to a template that failed to install', async () => {
    getOpEvents.mockResolvedValue(finished('op-install', 'failed'));
    await paint();
    await clickInstall('zed');
    await settle();

    expect(applySettings).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('zed could not be installed.');
  });

  it('asks the catalogue rather than guessing when it loses the install', async () => {
    // A fetch restarts the blog, so an unanswered poll is the expected shape of
    // one — not evidence it failed. The catalogue is what knows.
    getOpEvents.mockRejectedValue({ code: 'x', message: 'gone', status: 502, raw: null });
    getTemplates.mockResolvedValue(
      catalog({ available: ['atlas', 'quill', 'zed'], active: 'atlas', public: ['zed'] }),
    );
    await paint();
    await clickInstall('zed');
    await settle(95);

    expect(applySettings).toHaveBeenCalledWith({ template: 'zed' });
  });
});
