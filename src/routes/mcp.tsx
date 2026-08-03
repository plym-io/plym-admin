import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { applySettings, getSettings, getStatus } from '@/api/cloud';
import { isApiError } from '@/api/errors';
import { toInput } from '@/lib/settings';
import type { SettingSchema } from '@/types/cloud';
import { Page, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/skeleton';
import { Toggle } from '@/components/ui/toggle';
import { McpIcon } from '@/components/ui/mcp-icon';
import { Snippet } from '@/components/cloud/Snippet';
import { OpProgress } from '@/components/cloud/OpProgress';

/** The settings key that starts and stops the MCP container. */
const MCP_KEY = 'mcp.enabled';

/**
 * plym's MCP server is mounted at the domain root, never under the blog's
 * prefix — a blog at `/blog` still answers MCP on `/mcp`.
 */
function mcpEndpoint(siteUrl: string | undefined): string {
  try {
    return `${new URL(siteUrl ?? window.location.href).origin}/mcp`;
  } catch {
    return `${window.location.origin}/mcp`;
  }
}

/**
 * Turn the Model Context Protocol endpoint on or off, and — once it is on —
 * say exactly how to connect to it. Switching it applies straight away rather
 * than joining the settings screen's deploy queue: it is one switch, it starts
 * or stops a container, and nothing gets re-rendered.
 */
export default function Mcp() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [field, setField] = useState<SettingSchema | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opId, setOpId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const doc = await getSettings();
      setEnabled(toInput('bool', doc.values[MCP_KEY]) === true);
      setField(doc.schema.find((f) => f.key === MCP_KEY) ?? null);
      setError(null);
    } catch (e) {
      setError(isApiError(e) ? e.message : 'Could not read the MCP setting');
    }
  }, []);

  useEffect(() => {
    void load();
    getStatus()
      .then((s) => setEndpoint(mcpEndpoint(s.url)))
      .catch(() => setEndpoint(mcpEndpoint(undefined)));
  }, [load]);

  const toggle = async (next: boolean) => {
    setBusy(true);
    setOpId(null);
    try {
      const accepted = await applySettings({ [MCP_KEY]: next });
      setOpId(accepted.op_id);
      // Show the new state straight away; the log below carries the truth.
      setEnabled(next);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not change the MCP setting');
      setBusy(false);
    }
  };

  const settled = (state: 'succeeded' | 'failed') => {
    setBusy(false);
    if (state === 'succeeded') toast.success('MCP updated.');
    else toast.error('That did not go through.');
    void load();
  };

  const url = endpoint ?? mcpEndpoint(undefined);

  const clientConfig = `{
  "mcpServers": {
    "plym": {
      "type": "http",
      "url": "${url}",
      "headers": {
        "X-User-Identity": "you@example.com",
        "X-Mcp-Token": "your-plym-password"
      }
    }
  }
}`;

  return (
    <Page width="text">
      <PageHeader
        title="MCP"
        description="Let assistants read and write this blog over the Model Context Protocol."
      />

      <div className="mt-6 flex items-start gap-4 rounded-lg border border-border p-4">
        <McpIcon size={20} className="mt-0.5 shrink-0 text-fg-subtle" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-tight text-fg">
            MCP endpoint
          </h2>
          <p className="mt-0.5 text-sm text-fg-muted">
            {enabled
              ? 'Running. Any client with an account on this blog can connect.'
              : 'Off. Turning it on starts the MCP server for this blog — your posts are not re-rendered.'}
          </p>
          {field?.note && (
            <p className="mt-1 text-[13px] text-fg-subtle">{field.note}</p>
          )}
          {error && <p className="mt-1 text-[13px] text-danger">{error}</p>}
        </div>
        {enabled === null && !error ? (
          <Skeleton className="h-5 w-9 shrink-0" />
        ) : (
          <Toggle
            checked={enabled === true}
            disabled={busy || enabled === null}
            onChange={(next) => void toggle(next)}
            label="Enable MCP"
            className="mt-1.5"
          />
        )}
      </div>

      {opId && <OpProgress opId={opId} onSettled={settled} className="mt-3" />}

      {enabled && (
        <section className="mt-8 space-y-5">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-fg">
              Connect a client
            </h2>
            <p className="mt-0.5 text-sm text-fg-muted">
              Three things: the endpoint, and the two headers that identify you. The
              endpoint lives at your domain root, not under the blog's path.
            </p>
          </div>

          <Snippet label="Endpoint" code={url} />

          <div>
            <h3 className="text-[13.5px] font-medium text-fg">Credentials</h3>
            <p className="mt-0.5 text-[13px] text-fg-muted">
              <code className="font-mono text-fg">X-User-Identity</code> is the email of
              an account on this blog and{' '}
              <code className="font-mono text-fg">X-Mcp-Token</code> is that account's
              password. There is no separate MCP key — what the account may do, the
              client may do, so connect editors as editors and readers as readers.
            </p>
          </div>

          <Snippet label="Client configuration" code={clientConfig} />

          <div>
            <h3 className="text-[13.5px] font-medium text-fg">
              Clients that only speak stdio
            </h3>
            <p className="mt-0.5 mb-2 text-[13px] text-fg-muted">
              Bridge them over HTTP — plym's server cannot authenticate a stdio client.
            </p>
            <Snippet
              code={`npx mcp-remote ${url} \\
  --header "X-User-Identity: you@example.com" \\
  --header "X-Mcp-Token: your-plym-password"`}
            />
          </div>
        </section>
      )}
    </Page>
  );
}
