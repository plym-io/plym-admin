import { ChartLine } from '@phosphor-icons/react';
import { Page, PageHeader } from '@/components/ui/page';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Reserved. Traffic is collected at the edge, not by the blog, so there is
 * nothing to show here until that pipeline is exposed to tenants.
 */
export default function Analytics() {
  return (
    <Page width="text">
      <PageHeader title="Analytics" description="How your blog is doing." />
      <EmptyState
        className="mt-6"
        icon={ChartLine}
        title="Nothing to report yet."
        hint="Visitors, referrers and per-post performance will appear here once we start collecting them for your blog."
      />
    </Page>
  );
}
