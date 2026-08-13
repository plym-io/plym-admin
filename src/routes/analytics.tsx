import { Link } from 'react-router';
import { ArrowRight, Info } from '@phosphor-icons/react';
import { Page, PageHeader, Panel, PanelHeader, Section } from '@/components/ui/page';
import { Steps, Step } from '@/components/ui/steps';
import { Snippet } from '@/components/cloud/Snippet';
import { useAuthStore } from '@/store/auth';

/**
 * plym doesn't collect traffic itself. Rather than showing an empty dashboard
 * that will never fill, this page is the setup instructions for pointing a
 * real analytics provider at the blog.
 */

/** Providers people actually reach for. Any script tag works — these are the shortlist. */
const PROVIDERS = [
  { name: 'Google Analytics', href: 'https://analytics.google.com' },
  { name: 'Microsoft Clarity', href: 'https://clarity.microsoft.com' },
  { name: 'Pirsch', href: 'https://pirsch.io' },
  { name: 'Plausible', href: 'https://plausible.io' },
  { name: 'Fathom', href: 'https://usefathom.com' },
  { name: 'Umami', href: 'https://umami.is' },
];

const EXAMPLE = `<script defer src="https://plausible.io/js/script.js"
        data-domain="your-blog.com"></script>`;

/** The setup, for the people who can carry it out — Settings is admin-only. */
function AddScript() {
  return (
    <Panel flush>
      <PanelHeader
        title="Two steps"
        actions={
          <Link
            to="/settings"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
          >
            Open settings <ArrowRight size={13} />
          </Link>
        }
      />
      <div className="p-5">
        <Steps>
          <Step n={1} title="Go to Settings › Advanced › Inject">
            <p>
              <Link to="/settings" className="text-accent hover:underline">
                Settings
              </Link>{' '}
              holds the markup that goes onto every rendered page.
            </p>
          </Step>
          <Step n={2} title="Add the script under Head" last>
            <p className="mb-2.5">
              Paste the snippet your provider gives you, then deploy.
            </p>
            <Snippet label="Example" code={EXAMPLE} />
          </Step>
        </Steps>
      </div>
    </Panel>
  );
}

/**
 * The same setup seen by someone who can't do it. Settings doesn't exist for
 * them, so this names who to ask instead of linking somewhere that would only
 * bounce them home.
 */
function AskAnAdministrator() {
  return (
    <Panel>
      <p className="text-[13px] leading-relaxed text-fg-muted">
        The script goes under Settings › Advanced › Inject, which needs the
        administrator role. Ask an administrator of this blog to add it, then
        deploy.
      </p>
    </Panel>
  );
}

export default function Analytics() {
  const isAdmin = useAuthStore((s) => s.user?.role) === 'administrator';

  return (
    <Page width="text">
      <PageHeader title="Analytics" description="Set up analytics" />

      <div className="mt-6 space-y-6">
        <Panel>
          <p className="text-sm leading-relaxed text-fg-muted">
            plym doesn't collect traffic itself. Add the provider you already use —
            Google Analytics, Microsoft Clarity, Pirsch, Plausible — or any other
            service that gives you a script tag.
          </p>
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {PROVIDERS.map((p) => (
              <a
                key={p.name}
                href={p.href}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-pill border border-border bg-bg-subtle px-2.5 py-1 text-[12.5px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
              >
                {p.name}
              </a>
            ))}
          </div>
        </Panel>

        <Section title="Add a script">
          {isAdmin ? <AddScript /> : <AskAnAdministrator />}
        </Section>

        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-bg-subtle px-4 py-3">
          <Info size={16} weight="fill" className="mt-0.5 shrink-0 text-fg-subtle" />
          <p className="text-[13px] leading-relaxed text-fg-muted">
            Use <code className="font-mono text-[12.5px] text-fg">async</code> or{' '}
            <code className="font-mono text-[12.5px] text-fg">defer</code> on the script
            tag so it doesn't block the page from rendering.
          </p>
        </div>
      </div>
    </Page>
  );
}
