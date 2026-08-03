import {
  ArrowSquareOut,
  BookOpen,
  ChatCircleDots,
  EnvelopeSimple,
  GithubLogo,
  PhoneCall,
} from '@phosphor-icons/react';
import { useIsCloud } from '@/store/cloud';
import { cn } from '@/lib/classnames';
import type { UiIcon } from '@/components/ui/icon';
import { Page, PageHeader } from '@/components/ui/page';

interface Block {
  icon: UiIcon;
  title: string;
  body: string;
  /** Where it goes. Absent for the channels that aren't wired up yet. */
  href?: string;
  action: string;
}

/** Everywhere you can get help with plym itself. Both editions have these. */
const OPEN_BLOCKS: Block[] = [
  {
    icon: BookOpen,
    title: 'Documentation',
    body: 'How plym works, end to end — configuration, templates, the API and the CLI.',
    href: 'https://plym.io/docs',
    action: 'plym.io/docs',
  },
  {
    icon: GithubLogo,
    title: 'GitHub',
    body: 'Report a bug, request a feature, or read what everyone else has run into.',
    href: 'https://github.com/plym-io/plym/issues',
    action: 'Open an issue',
  },
];

/** Paid channels. Listed now, connected in a later release. */
const CLOUD_BLOCKS: Block[] = [
  {
    icon: EnvelopeSimple,
    title: 'Email support',
    body: 'Send us the details and we answer in your inbox.',
    action: 'Coming soon',
  },
  {
    icon: PhoneCall,
    title: 'Book a call',
    body: 'Half an hour with someone who knows your deployment.',
    action: 'Coming soon',
  },
  {
    icon: ChatCircleDots,
    title: 'Something else',
    body: 'Migrations, custom templates, anything that needs a human.',
    action: 'Coming soon',
  },
];

function SupportCard({ block }: { block: Block }) {
  const Icon = block.icon;
  const live = Boolean(block.href);
  const content = (
    <>
      <div className="flex items-center gap-2.5">
        <Icon size={20} weight="duotone" className="shrink-0 text-fg-subtle" />
        <h2 className="text-[15px] font-semibold tracking-tight text-fg">{block.title}</h2>
      </div>
      <p className="mt-1.5 text-sm text-fg-muted">{block.body}</p>
      <p
        className={cn(
          'mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium',
          live ? 'text-accent' : 'text-fg-subtle',
        )}
      >
        {block.action}
        {live && <ArrowSquareOut size={13} />}
      </p>
    </>
  );

  if (!live) {
    return (
      <div className="rounded-lg border border-border p-4 opacity-70">{content}</div>
    );
  }
  return (
    <a
      href={block.href}
      target="_blank"
      rel="noreferrer noopener"
      className="block rounded-lg border border-border p-4 transition-colors hover:border-border-strong hover:bg-bg-subtle"
    >
      {content}
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
      <PageHeader
        title="Support"
        description="Answers, and people who can help."
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {OPEN_BLOCKS.map((b) => (
          <SupportCard key={b.title} block={b} />
        ))}
      </div>

      {isCloud && (
        <>
          <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            Included with your plan
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {CLOUD_BLOCKS.map((b) => (
              <SupportCard key={b.title} block={b} />
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
