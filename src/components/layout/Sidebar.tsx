import { NavLink } from 'react-router';
import { motion } from 'motion/react';
import {
  House,
  Article,
  Images,
  Users as UsersIcon,
  Pulse,
  GearSix,
  type Icon,
} from '@phosphor-icons/react';
import { useUiStore } from '@/store/ui';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/classnames';

interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  adminOnly?: boolean;
  end?: boolean;
}

const PRIMARY: NavItem[] = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/posts', label: 'Posts', icon: Article },
  { to: '/media', label: 'Media', icon: Images },
];

const SECONDARY: NavItem[] = [
  { to: '/users', label: 'Users', icon: UsersIcon, adminOnly: true },
  { to: '/logs', label: 'Logs', icon: Pulse },
  { to: '/settings', label: 'Settings', icon: GearSix },
];

function Item({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors',
          collapsed && 'justify-center px-0',
          isActive
            ? 'text-fg'
            : 'text-fg-muted hover:bg-bg-muted hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 -z-10 rounded-md bg-bg-muted"
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
          <Icon
            size={20}
            weight="duotone"
            className={cn(isActive && 'text-accent')}
          />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const role = useAuthStore((s) => s.user?.role);

  const secondary = SECONDARY.filter(
    (i) => !i.adminOnly || role === 'administrator',
  );

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-border bg-bg-subtle py-3 transition-[width] duration-220',
        collapsed ? 'w-14 px-2' : 'w-[200px] px-3',
      )}
    >
      <nav className="flex flex-col gap-0.5">
        {PRIMARY.map((item) => (
          <Item key={item.to} item={item} collapsed={collapsed} />
        ))}
      </nav>
      <div
        className={cn(
          'my-3 border-t border-border',
          collapsed ? 'mx-1' : 'mx-2',
        )}
      />
      <nav className="flex flex-col gap-0.5">
        {secondary.map((item) => (
          <Item key={item.to} item={item} collapsed={collapsed} />
        ))}
      </nav>
    </aside>
  );
}
