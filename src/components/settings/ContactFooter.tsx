import { Link } from 'react-router';
import { ArrowRight } from '@phosphor-icons/react';

/**
 * The end of the settings screen. Not everything a tenant might want is a
 * switch, and this is where the ones that aren't get a route to a human.
 */
export function ContactFooter() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg-subtle px-5 py-4">
      <p className="text-[13.5px] text-fg-muted">Looking for something else?</p>
      <Link
        to="/support"
        className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-accent transition-opacity hover:opacity-80"
      >
        Contact us <ArrowRight size={14} />
      </Link>
    </div>
  );
}
