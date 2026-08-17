import { Link, NavLink } from 'react-router';
import { motion } from 'motion/react';
import { ArrowSquareOut, CaretLineLeft, CaretLineRight } from '@phosphor-icons/react';
import { useUiStore } from '@/store/ui';
import { useEdition } from '@/store/cloud';
import { cn } from '@/lib/classnames';
import { asset } from '@/lib/base';
import { useNavContext, visibleNav, type NavItem } from './nav';

const ROW =
  'group relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13.5px] font-medium transition-colors';

/**
 * A destination outside the panel. Deliberately not a NavLink: it can never be
 * the active route, and the arrow says so before the click rather than after
 * the tab has opened.
 */
function ExternalItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <a
      href={item.to}
      target="_blank"
      rel="noreferrer noopener"
      title={collapsed ? item.label : undefined}
      className={cn(
        ROW,
        'text-fg-muted hover:bg-bg-muted hover:text-fg',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon size={17} className="shrink-0" />
      {!collapsed && (
        <>
          <span className="truncate">{item.label}</span>
          <ArrowSquareOut size={12} className="ml-auto shrink-0 text-fg-subtle" />
        </>
      )}
    </a>
  );
}

function Item({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  if (item.external) return <ExternalItem item={item} collapsed={collapsed} />;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          ROW,
          collapsed && 'justify-center px-0',
          isActive ? 'text-fg' : 'text-fg-muted hover:bg-bg-muted hover:text-fg',
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
          {/* The rail. It reads as "you are here" at a glance from the edge of
              the screen, which the fill alone doesn't once the eye is in the
              content area. */}
          {isActive && (
            <motion.span
              layoutId="nav-active-rail"
              className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-accent"
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
          <Icon
            size={17}
            weight={isActive ? 'fill' : 'regular'}
            className={cn('shrink-0', isActive && 'text-accent')}
          />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const edition = useEdition();
  const groups = visibleNav(useNavContext());

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-border bg-bg transition-[width] duration-220',
        collapsed ? 'w-[60px]' : 'w-[236px]',
      )}
    >
      {/* Brand. In an admin console the product mark belongs to the navigation,
          not to the working area above the content. */}
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b border-border',
          collapsed ? 'justify-center px-2' : 'gap-2 px-4',
        )}
      >
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80"
          aria-label="plym home"
        >
          <img
            src={asset('logo.svg')}
            alt="plym"
            className={cn('w-auto', collapsed ? 'h-6' : 'h-7')}
            onError={(e) => {
              const el = e.currentTarget;
              el.style.display = 'none';
              el.insertAdjacentHTML(
                'afterend',
                '<span class="font-display text-[17px] font-bold tracking-tight">plym</span>',
              );
            }}
          />
        </Link>
        {!collapsed && edition === 'cloud' && (
          <span className="rounded-pill border border-border bg-bg-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
            Cloud
          </span>
        )}
        {!collapsed && (
          <button
            onClick={toggle}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="ml-auto rounded-md p-1 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
          >
            <CaretLineLeft size={15} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map((group, i) => (
          <div key={group.label ?? `group-${i}`}>
            {/* Collapsed to icons, a heading has nowhere to go — a rule keeps
                the same grouping legible at 60px wide. */}
            {i > 0 &&
              (collapsed || !group.label ? (
                <div className={cn('my-2.5 border-t border-border', collapsed ? 'mx-1' : 'mx-2')} />
              ) : (
                <p className="mt-5 mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
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
      </div>

      {collapsed && (
        <div className="flex shrink-0 justify-center border-t border-border py-2">
          <button
            onClick={toggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
          >
            <CaretLineRight size={15} />
          </button>
        </div>
      )}
    </aside>
  );
}
