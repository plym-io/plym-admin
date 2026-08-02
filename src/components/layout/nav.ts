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
  Database,
  Lifebuoy,
  ChartLine,
} from '@phosphor-icons/react';
import { McpIcon } from '@/components/ui/mcp-icon';
import type { UiIcon } from '@/components/ui/icon';

export interface NavItem {
  to: string;
  label: string;
  icon: UiIcon;
  /** Extra words the command palette should match on. */
  keywords?: string;
  adminOnly?: boolean;
  end?: boolean;
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
 * Groups appear in this order. Home sits above them all, and the sections that
 * answer "something is wrong" or "give me everything" sit below, unlabelled,
 * because neither belongs under a single heading.
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
      { to: '/domain', label: 'Domain', icon: Globe, keywords: 'dns hostname' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/mcp', label: 'MCP', icon: McpIcon, keywords: 'model context protocol' },
      { to: '/api', label: 'API', icon: Code, keywords: 'rest openapi tokens' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      // Leads (form submissions) are administrator-only.
      { to: '/leads', label: 'Leads', icon: Target, adminOnly: true, keywords: 'submissions' },
      { to: '/analytics', label: 'Analytics', icon: ChartLine, keywords: 'traffic stats' },
    ],
  },
  {
    items: [
      { to: '/data', label: 'Data', icon: Database, keywords: 'export import backup' },
      { to: '/support', label: 'Support', icon: Lifebuoy, keywords: 'help contact' },
    ],
  },
];

/** The nav, minus anything this role isn't allowed to see. */
export function visibleNav(role: string | undefined): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.adminOnly || role === 'administrator'),
  })).filter((g) => g.items.length > 0);
}

/**
 * The same nav flattened for the command palette, where every group needs a
 * heading — the sidebar's two unlabelled runs collapse into one "Pages".
 */
export function navSections(role: string | undefined): Required<NavGroup>[] {
  const groups = visibleNav(role);
  const loose = groups.filter((g) => !g.label).flatMap((g) => g.items);
  return [
    ...(loose.length ? [{ label: 'Pages', items: loose }] : []),
    ...groups.filter((g): g is Required<NavGroup> => Boolean(g.label)),
  ];
}
