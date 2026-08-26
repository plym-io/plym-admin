import { Suspense, lazy } from 'react';
import { useIsCloud } from '@/store/cloud';
import { RouteFallback } from '@/components/layout/RouteFallback';

// Split so a self-hosted blog never downloads the cloud form, and vice versa.
const OssSettings = lazy(() => import('./settings.oss'));
const CloudSettings = lazy(() => import('./settings.cloud'));

/**
 * Two quite different screens behind one route: self-hosted blogs get a
 * read-only view of `config.yaml`, cloud blogs get the editable form the
 * gateway describes.
 */
export default function Settings() {
  const isCloud = useIsCloud();
  return (
    <Suspense fallback={<RouteFallback />}>
      {isCloud ? <CloudSettings /> : <OssSettings />}
    </Suspense>
  );
}
