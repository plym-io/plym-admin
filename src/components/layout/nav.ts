import {
  House,
  Article,
  Images,
  Target,
  Users as UsersIcon,
  Question,
  Tag,
  FolderSimple,
  GearSix,
  Globe,
  Code,
  Lifebuoy,
  ChartLine,
} from '@phosphor-icons/react';
import { McpIcon } from '@/components/ui/mcp-icon';
import type { UiIcon } from '@/components/ui/icon';
import { capabilityOn, useCloudStore } from '@/store/cloud';
import { useAuthStore } from '@/store/auth';
import type { Capabilities } from '@/types/cloud';

export interface NavItem {
  to: string;
  label: string;
  icon: UiIcon;
  /** Extra words the command palette should match on. */
  keywords?: string;
  adminOnly?: boolean;
  /** Only exists on plym cloud — an OSS blog has nothing to put on the page. */
  cloudOnly?: boolean;
  /** Capability flag from `GET /cloud/capabilities` that switches this off. */
  capability?: string;
  end?: boolean;
}

/** What the nav is being rendered for: who is looking, and at which product. */
export interface NavContext {
  role?: string;
  cloud?: boolean;
  capabilities?: Capabilities | null;
}

export interface NavGroup {
  /** Absent for the handful of destinations that don't belong to a section. */
  label?: string;
  items: NavItem[];
}

/**
 * The one description of the admin's navigation — rendered by the sidebar and
 * replayed as the command palette's "Pages" list, so the two can't drift.
 *
 * Groups appear in this order. Home sits above them all, and Support sits
 * below, unlabelled, because it doesn't belong under a section heading.
 *
 * The `cloudOnly` destinations are the ones with nothing behind them on an OSS
 * blog — no gateway to ask for domains, no edge collecting traffic. They are
 * hidden rather than stubbed, so the OSS panel is only what it can do. MCP and
 * the API reference are *not* among them: both editions have both, they are
 * just reached differently, and each page says which way round it is.
 */
export const NAV: NavGroup[] = [
  {
    items: [{ to: '/', label: 'Home', icon: House, end: true }],
  },
  {
    label: 'Content',
    items: [
      { to: '/posts', label: 'Posts', icon: Article },
      { to: '/media', label: 'Media', icon: Images, keywords: 'library images' },
      { to: '/categories', label: 'Categories', icon: FolderSimple },
      { to: '/tags', label: 'Tags', icon: Tag },
      { to: '/faqs', label: 'FAQs', icon: Question, keywords: 'questions' },
    ],
  },
  {
    label: 'Administration',
    // Everyone can see Users; the management actions inside are admin-gated.
    items: [
      { to: '/users', label: 'Users', icon: UsersIcon },
      { to: '/settings', label: 'Settings', icon: GearSix, keywords: 'config' },
      {
        to: '/domain',
        label: 'Domain',
        icon: Globe,
        keywords: 'dns hostname',
        cloudOnly: true,
        capability: 'routing',
      },
    ],
  },
  {
    label: 'Tools',
    items: [
      {
        to: '/mcp',
        label: 'MCP',
        icon: McpIcon,
        keywords: 'model context protocol',
        capability: 'mcp',
      },
      {
        to: '/api',
        label: 'API',
        icon: Code,
        keywords: 'rest openapi reference swagger',
      },
    ],
  },
  {
    label: 'Marketing',
    items: [
      // Leads (form submissions) are administrator-only.
      { to: '/leads', label: 'Leads', icon: Target, adminOnly: true, keywords: 'submissions' },
      {
        to: '/analytics',
        label: 'Analytics',
        icon: ChartLine,
        keywords: 'traffic stats',
        cloudOnly: true,
        capability: 'analytics',
      },
    ],
  },
  {
    items: [
      { to: '/support', label: 'Support', icon: Lifebuoy, keywords: 'help contact' },
    ],
  },
];

/** Who is looking and at which product — the sidebar and the palette share it. */
export function useNavContext(): NavContext {
  const role = useAuthStore((s) => s.user?.role);
  const edition = useCloudStore((s) => s.edition);
  const capabilities = useCloudStore((s) => s.capabilities);
  return { role, cloud: edition === 'cloud', capabilities };
}

/** The nav, minus anything this role — or this edition — can't see. */
export function visibleNav({ role, cloud, capabilities }: NavContext): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) =>
        (!i.adminOnly || role === 'administrator') &&
        (!i.cloudOnly || cloud === true) &&
        (!i.capability || !cloud || capabilityOn(capabilities ?? null, i.capability)),
    ),
  })).filter((g) => g.items.length > 0);
}

/**
 * Where a path sits in the nav: its section, and the item it belongs to.
 * Matched on the longest `to` that prefixes the path, so `/posts/42` resolves
 * to Posts rather than falling through to Home.
 */
export function locateNav(
  pathname: string,
): { group?: string; item: NavItem } | null {
  let best: { group?: string; item: NavItem } | null = null;
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.to === '/') {
        if (pathname === '/') best = { group: group.label, item };
        continue;
      }
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        if (!best || item.to.length > best.item.to.length) {
          best = { group: group.label, item };
        }
      }
    }
  }
  return best;
}

/**
 * The same nav flattened for the command palette, where every group needs a
 * heading — the sidebar's two unlabelled runs collapse into one "Pages".
 */
export function navSections(ctx: NavContext): Required<NavGroup>[] {
  const groups = visibleNav(ctx);
  const loose = groups.filter((g) => !g.label).flatMap((g) => g.items);
  return [
    ...(loose.length ? [{ label: 'Pages', items: loose }] : []),
    ...groups.filter((g): g is Required<NavGroup> => Boolean(g.label)),
  ];
}
