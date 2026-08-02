import { Page, PageHeader } from '@/components/ui/page';
import { EmptyState } from '@/components/ui/empty-state';
import type { UiIcon } from '@/components/ui/icon';

interface Props {
  title: string;
  description: string;
  icon: UiIcon;
  /** What this section will do, once it does it. */
  hint: string;
}

/**
 * Stands in for a section that is navigable but not built yet. Reachable from
 * the sidebar on purpose — the shape of the product should be visible before
 * every part of it exists.
 */
export function Placeholder({ title, description, icon, hint }: Props) {
  return (
    <Page width="text">
      <PageHeader title={title} description={description} />
      <EmptyState className="mt-6" icon={icon} title="Not built yet." hint={hint} />
    </Page>
  );
}
