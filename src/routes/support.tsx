import {
  ArrowSquareOut,
  BookOpen,
  EnvelopeSimple,
  GithubLogo,
  PhoneCall,
} from '@phosphor-icons/react';
import { useIsCloud } from '@/store/cloud';
import type { UiIcon } from '@/components/ui/icon';
import { Page, PageHeader, Section } from '@/components/ui/page';

interface Channel {
  icon: UiIcon;
  title: string;
  body: string;
  href: string;
  action: string;
}

/** Open to both editions. */
const OPEN: Channel[] = [
  {
    icon: BookOpen,
    title: 'Documentation',
    body: 'Configuration, templates, the API and the CLI.',
    href: 'https://plym.io/docs',
    action: 'plym.io/docs',
  },
  {
    icon: GithubLogo,
    title: 'GitHub',
    body: 'Report a bug or request a feature.',
    href: 'https://github.com/plym-io/plym/issues',
    action: 'Open an issue',
  },
];

/** Included with a cloud plan. */
const CLOUD: Channel[] = [
  {
    icon: PhoneCall,
    title: 'Book a call',
    body: 'Half an hour with someone who knows your deployment.',
    href: 'https://cal.com/adarshpunj',
    action: 'cal.com/adarshpunj',
  },
  {
    icon: EnvelopeSimple,
    title: 'Email',
    body: 'Send us the details and we answer in your inbox.',
    href: 'mailto:plym@flapico.com',
    action: 'plym@flapico.com',
  },
];

function ChannelCard({ channel }: { channel: Channel }) {
  const Icon = channel.icon;
  const external = !channel.href.startsWith('mailto:');
  return (
    <a
      href={channel.href}
      {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      className="group flex flex-col rounded-xl border border-border bg-bg p-4 shadow-xs transition-colors hover:border-border-strong hover:bg-bg-subtle"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-subtle text-fg-muted transition-colors group-hover:bg-accent-soft group-hover:text-accent">
          <Icon size={17} weight="duotone" />
        </span>
        <h3 className="text-[14px] font-semibold tracking-tight text-fg">
          {channel.title}
        </h3>
      </div>
      <p className="mt-2.5 text-[13px] leading-relaxed text-fg-muted">{channel.body}</p>
      <p className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent">
        {channel.action}
        <ArrowSquareOut size={12} />
      </p>
    </a>
  );
}

/**
 * Where to go when something is wrong. A self-hosted blog gets the two places
 * that are genuinely open to it; cloud customers get those plus the channels
 * they are paying for.
 */
export default function Support() {
  const isCloud = useIsCloud();

  return (
    <Page width="text">
      <PageHeader title="Support" />

      <div className="mt-6 space-y-7">
        {isCloud && (
          <Section title="Included with your plan">
            <div className="grid gap-4 sm:grid-cols-2">
              {CLOUD.map((c) => (
                <ChannelCard key={c.title} channel={c} />
              ))}
            </div>
          </Section>
        )}

        <Section title={isCloud ? 'Self-serve' : undefined}>
          <div className="grid gap-4 sm:grid-cols-2">
            {OPEN.map((c) => (
              <ChannelCard key={c.title} channel={c} />
            ))}
          </div>
        </Section>
      </div>
    </Page>
  );
}
