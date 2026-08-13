import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Suspense, lazy } from 'react';
import { adminBase } from '@/lib/base';
import { AppShell } from '@/components/layout/AppShell';
import { RequireAuth } from '@/components/layout/RequireAuth';
import { RouteFallback } from '@/components/layout/RouteFallback';
import { useIsCloud } from '@/store/cloud';
import { useAuthStore } from '@/store/auth';

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
const Support = lazy(() => import('@/routes/support'));
const Domain = lazy(() => import('@/routes/domain'));
const Mcp = lazy(() => import('@/routes/mcp'));
const Analytics = lazy(() => import('@/routes/analytics'));
const ApiReference = lazy(() => import('@/routes/api'));

const wrap = (el: React.ReactNode) => (
  <Suspense fallback={<RouteFallback />}>{el}</Suspense>
);

/**
 * A section that only exists on plym cloud. Self-hosted blogs have no gateway
 * behind these screens, so a deep link goes home rather than to something
 * broken — the sidebar doesn't offer them in the first place.
 */
function CloudOnly({ children }: { children: React.ReactNode }) {
  return useIsCloud() ? <>{children}</> : <Navigate to="/" replace />;
}

/**
 * A section only administrators have. The API answers 403 to everyone else, so
 * these screens don't exist for them: the sidebar and the palette leave them
 * out (`adminOnly` in nav.ts) and a deep link goes home. RequireAuth has the
 * current user in hand before any of this renders, so the role is never a
 * guess.
 */
function AdminOnly({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  return role === 'administrator' ? <>{children}</> : <Navigate to="/" replace />;
}

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
        {
          path: 'leads',
          element: wrap(
            <AdminOnly>
              <Leads />
            </AdminOnly>,
          ),
        },
        { path: 'users', element: wrap(<Users />) },
        { path: 'faqs', element: wrap(<Faqs />) },
        { path: 'tags', element: wrap(<Tags />) },
        { path: 'categories', element: wrap(<Categories />) },
        {
          path: 'settings',
          element: wrap(
            <AdminOnly>
              <Settings />
            </AdminOnly>,
          ),
        },
        { path: 'support', element: wrap(<Support />) },
        { path: 'api', element: wrap(<ApiReference />) },
        // Both editions run an MCP server; only the way you switch it on
        // differs, so the page is reachable either way.
        { path: 'mcp', element: wrap(<Mcp />) },
        {
          path: 'domain',
          element: wrap(
            <CloudOnly>
              <AdminOnly>
                <Domain />
              </AdminOnly>
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
      ],
    },
  ],
  { basename: adminBase },
);

export function App() {
  return <RouterProvider router={router} />;
}
