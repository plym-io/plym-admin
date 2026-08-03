import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Suspense, lazy } from 'react';
import { adminBase } from '@/lib/base';
import { AppShell } from '@/components/layout/AppShell';
import { RequireAuth } from '@/components/layout/RequireAuth';
import { RouteFallback } from '@/components/layout/RouteFallback';
import { Placeholder } from '@/routes/placeholder';
import { NAV } from '@/components/layout/nav';
import { useIsCloud } from '@/store/cloud';

const Login = lazy(() => import('@/routes/login'));
const Home = lazy(() => import('@/routes/home'));
const PostsList = lazy(() => import('@/routes/posts.list'));
const PostEditor = lazy(() => import('@/routes/posts.editor'));
const Media = lazy(() => import('@/routes/media'));
const Leads = lazy(() => import('@/routes/leads'));
const Users = lazy(() => import('@/routes/users'));
const Faqs = lazy(() => import('@/routes/faqs'));
const Tags = lazy(() => import('@/routes/tags'));
const Categories = lazy(() => import('@/routes/categories'));
const Settings = lazy(() => import('@/routes/settings'));
const Data = lazy(() => import('@/routes/data'));
const Support = lazy(() => import('@/routes/support'));
const Domain = lazy(() => import('@/routes/domain'));
const Mcp = lazy(() => import('@/routes/mcp'));
const Analytics = lazy(() => import('@/routes/analytics'));

const wrap = (el: React.ReactNode) => (
  <Suspense fallback={<RouteFallback />}>{el}</Suspense>
);

/**
 * Sections that are in the nav but not built yet. Each gets a real route so
 * the link works, deep-links resolve and the back button behaves — they just
 * land on a page that says what will live there.
 */
const STUBS: Record<string, { description: string; hint: string }> = {
  '/api': {
    description: 'Programmatic access to posts, media and everything else.',
    hint: 'API keys and the endpoint reference will live here.',
  },
};

/**
 * A section that only exists on plym cloud. Self-hosted blogs have no gateway
 * behind these screens, so a deep link goes home rather than to something
 * broken — the sidebar doesn't offer them in the first place.
 */
function CloudOnly({ children }: { children: React.ReactNode }) {
  return useIsCloud() ? <>{children}</> : <Navigate to="/" replace />;
}

const stubRoutes = NAV.flatMap((g) => g.items)
  .filter((item) => item.to in STUBS)
  .map((item) => {
    const page = (
      <Placeholder
        title={item.label}
        icon={item.icon}
        description={STUBS[item.to].description}
        hint={STUBS[item.to].hint}
      />
    );
    return {
      path: item.to.slice(1),
      element: item.cloudOnly ? <CloudOnly>{page}</CloudOnly> : page,
    };
  });

const router = createBrowserRouter(
  [
    { path: '/login', element: wrap(<Login />) },
    {
      element: (
        <RequireAuth>
          <AppShell />
        </RequireAuth>
      ),
      children: [
        { index: true, element: wrap(<Home />) },
        { path: 'posts', element: wrap(<PostsList />) },
        // "new" is a sentinel id so /posts/new and /posts/:id share one route —
        // creating a post swaps the param in place without remounting the editor.
        { path: 'posts/:id', element: wrap(<PostEditor />) },
        { path: 'media', element: wrap(<Media />) },
        { path: 'leads', element: wrap(<Leads />) },
        { path: 'users', element: wrap(<Users />) },
        { path: 'faqs', element: wrap(<Faqs />) },
        { path: 'tags', element: wrap(<Tags />) },
        { path: 'categories', element: wrap(<Categories />) },
        { path: 'settings', element: wrap(<Settings />) },
        { path: 'data', element: wrap(<Data />) },
        { path: 'support', element: wrap(<Support />) },
        {
          path: 'domain',
          element: wrap(
            <CloudOnly>
              <Domain />
            </CloudOnly>,
          ),
        },
        {
          path: 'mcp',
          element: wrap(
            <CloudOnly>
              <Mcp />
            </CloudOnly>,
          ),
        },
        {
          path: 'analytics',
          element: wrap(
            <CloudOnly>
              <Analytics />
            </CloudOnly>,
          ),
        },
        ...stubRoutes,
      ],
    },
  ],
  { basename: adminBase },
);

export function App() {
  return <RouterProvider router={router} />;
}
