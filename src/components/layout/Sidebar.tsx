import { NavLink } from 'react-router';
import { motion } from 'motion/react';
import { useUiStore } from '@/store/ui';
import { cn } from '@/lib/classnames';
import { useNavContext, visibleNav, type NavItem } from './nav';

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
  const groups = visibleNav(useNavContext());

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col overflow-y-auto border-r border-border bg-bg-subtle py-3 transition-[width] duration-220',
        collapsed ? 'w-14 px-2' : 'w-[200px] px-3',
      )}
    >
      {groups.map((group, i) => (
        <div key={group.label ?? `group-${i}`}>
          {/* Collapsed to icons, a heading has nowhere to go — a rule keeps the
              same grouping legible at 56px wide. */}
          {i > 0 &&
            (collapsed || !group.label ? (
              <div
                className={cn('my-3 border-t border-border', collapsed ? 'mx-1' : 'mx-2')}
              />
            ) : (
              <p className="mt-5 mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                {group.label}
              </p>
            ))}
          <nav className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <Item key={item.to} item={item} collapsed={collapsed} />
            ))}
          </nav>
        </div>
      ))}
    </aside>
  );
}
