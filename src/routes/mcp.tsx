import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Lock, Terminal } from '@phosphor-icons/react';
import { applySettings, getSettings, getStatus } from '@/api/cloud';
import { isApiError } from '@/api/errors';
import { toInput } from '@/lib/settings';
import { useIsCloud } from '@/store/cloud';
import { useAuthStore } from '@/store/auth';
import type { SettingSchema } from '@/types/cloud';
import { Page, PageHeader, Panel, PanelHeader, Section } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/skeleton';
import { Toggle } from '@/components/ui/toggle';
import { McpIcon } from '@/components/ui/mcp-icon';
import { Snippet } from '@/components/cloud/Snippet';
import { OpProgress, type OpOutcome } from '@/components/cloud/OpProgress';

/** The settings key that starts and stops the MCP container on cloud. */
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
 * Everything a client needs once the server is running. Identical on both
 * editions — only the way you switch it on differs — so it lives in one place
 * and each edition renders it under its own enablement instructions.
 */
function ConnectAClient({ url }: { url: string }) {
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
    <Section title="Connect a client">
      <Panel flush>
        <PanelHeader
          title="Endpoint and credentials"
          description="The endpoint lives at your domain root, not under the blog's path."
        />
        <div className="space-y-5 p-5">
          <Snippet label="Endpoint" code={url} />

          <div>
            <h3 className="text-[13.5px] font-medium text-fg">Credentials</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
              <code className="font-mono text-fg">X-User-Identity</code> is the email of
              an account on this blog;{' '}
              <code className="font-mono text-fg">X-Mcp-Token</code> is that account's
              password. There is no separate MCP key — a client can do whatever its
              account can.
            </p>
          </div>

          <Snippet label="Client configuration" code={clientConfig} />

          <div>
            <h3 className="text-[13.5px] font-medium text-fg">
              Clients that only speak stdio
            </h3>
            <p className="mt-1 mb-2.5 text-[13px] text-fg-muted">
              Bridge them over HTTP — plym's server cannot authenticate a stdio client.
            </p>
            <Snippet
              code={`npx mcp-remote ${url} \\
  --header "X-User-Identity: you@example.com" \\
  --header "X-Mcp-Token: your-plym-password"`}
            />
          </div>
        </div>
      </Panel>
    </Section>
  );
}

/**
 * Self-hosted: there is no gateway to flip, and `/api/config` doesn't carry an
 * MCP section, so the panel genuinely cannot know whether the server is up.
 * Rather than guess, it says what to run.
 */
function OssMcp() {
  const url = mcpEndpoint(undefined);

  return (
    <>
      <Section title="Enable the server">
        <Panel flush>
          <PanelHeader
            title="Run it from the CLI"
            description="On the machine hosting your blog."
          />
          <div className="space-y-5 p-5">
            <div>
              <p className="mb-2.5 text-[13px] leading-relaxed text-fg-muted">
                The short form serves MCP at <code className="font-mono text-fg">/mcp</code>{' '}
                on the domain the blog already uses, through the same reverse proxy.
              </p>
              <Snippet code="plym enable mcp" />
            </div>

            <div>
              <p className="mb-2.5 text-[13px] leading-relaxed text-fg-muted">
                To give it its own hostname instead, pass the address and the proxy in
                front of it — <code className="font-mono text-fg">--nginx</code>,{' '}
                <code className="font-mono text-fg">--caddy</code> or{' '}
                <code className="font-mono text-fg">--traefik</code>. plym writes that
                proxy's config for you.
              </p>
              <Snippet
                label="Own hostname"
                code={`plym enable mcp <url> --<proxy>

# for example
plym enable mcp mcp.your-domain.com --caddy`}
              />
            </div>

            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-bg-subtle px-3.5 py-2.5">
              <Terminal size={15} className="mt-0.5 shrink-0 text-fg-subtle" />
              <p className="text-[12.5px] leading-relaxed text-fg-muted">
                <code className="font-mono text-fg">plym disable mcp</code> stops the
                server and removes the proxy config it created.
              </p>
            </div>
          </div>
        </Panel>
      </Section>

      <ConnectAClient url={url} />
    </>
  );
}

/**
 * plym cloud: one switch. It applies straight away rather than joining the
 * settings screen's deploy queue — it starts or stops a container, and nothing
 * gets re-rendered.
 */
function CloudMcp() {
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

  const settled = (outcome: OpOutcome) => {
    setBusy(false);
    if (outcome === 'succeeded') toast.success('MCP updated.');
    else if (outcome === 'failed') toast.error('That did not go through.');
    // Toggling MCP restarts the blog. Losing it mid-restart is not a result,
    // and the reload below is what turns it into one.
    else toast('Lost sight of that while the blog restarted.');
    void load();
  };

  // Until the gateway answers we don't know the state — and "Off" is the one
  // answer we must not guess, because it's also what a working server looks
  // like for the half-second before the truth arrives.
  const unknown = enabled === null && !error;

  return (
    <>
      <Panel>
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-subtle text-fg-muted">
            <McpIcon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold tracking-tight text-fg">
              MCP endpoint
            </h2>
            {unknown ? (
              <div className="mt-2 space-y-1.5">
                <Skeleton className="h-3.5 w-64" />
                <Skeleton className="h-3.5 w-40" />
              </div>
            ) : (
              <>
                <p className="mt-0.5 text-[13px] text-fg-muted">
                  {enabled
                    ? 'Running. Any client with an account on this blog can connect.'
                    : 'Off. Turning it on starts the MCP server — your posts are not re-rendered.'}
                </p>
                {field?.note && (
                  <p className="mt-1 text-[12.5px] text-fg-subtle">{field.note}</p>
                )}
                {error && <p className="mt-1 text-[12.5px] text-danger">{error}</p>}
              </>
            )}
          </div>
          {unknown ? (
            <Skeleton className="mt-1.5 h-5 w-9 shrink-0 rounded-full" />
          ) : (
            <Toggle
              checked={enabled === true}
              disabled={busy}
              onChange={(next) => void toggle(next)}
              label="Enable MCP"
              className="mt-1.5"
            />
          )}
        </div>
      </Panel>

      {opId && <OpProgress opId={opId} onSettled={settled} />}

      {enabled && <ConnectAClient url={endpoint ?? mcpEndpoint(undefined)} />}
    </>
  );
}

/**
 * Anyone below administrator. Whether the server is running is not knowable
 * from here — the gateway answers 403 to the settings it would take to find
 * out — so the page says nothing about it rather than implying "off". The
 * connection details need no privilege and are the half of the page they can
 * actually use, so they stay.
 */
function ReadOnlyMcp() {
  return (
    <>
      <Panel>
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-subtle text-fg-muted">
            <Lock size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold tracking-tight text-fg">
              An administrator looks after this
            </h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-fg-muted">
              Changing MCP settings needs the administrator role. Ask an
              administrator of this blog if you need them changed.
            </p>
          </div>
        </div>
      </Panel>

      <ConnectAClient url={mcpEndpoint(undefined)} />
    </>
  );
}

export default function Mcp() {
  const isCloud = useIsCloud();
  const isAdmin = useAuthStore((s) => s.user?.role) === 'administrator';

  return (
    <Page width="text">
      <PageHeader
        title="MCP"
        description="Let assistants read and write this blog over the Model Context Protocol."
      />
      <div className="mt-6 space-y-6">
        {!isAdmin ? <ReadOnlyMcp /> : isCloud ? <CloudMcp /> : <OssMcp />}
      </div>
    </Page>
  );
}
