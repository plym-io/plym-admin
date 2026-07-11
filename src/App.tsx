import { createBrowserRouter, RouterProvider } from 'react-router';
import { Suspense, lazy } from 'react';
import { adminBase } from '@/lib/base';
import { AppShell } from '@/components/layout/AppShell';
import { RequireAuth } from '@/components/layout/RequireAuth';
import { RouteFallback } from '@/components/layout/RouteFallback';

const Login = lazy(() => import('@/routes/login'));
const Home = lazy(() => import('@/routes/home'));
const PostsList = lazy(() => import('@/routes/posts.list'));
const PostEditor = lazy(() => import('@/routes/posts.editor'));
const Media = lazy(() => import('@/routes/media'));
const Leads = lazy(() => import('@/routes/leads'));
const Users = lazy(() => import('@/routes/users'));
const Faqs = lazy(() => import('@/routes/faqs'));
const Tags = lazy(() => import('@/routes/tags'));
const Settings = lazy(() => import('@/routes/settings'));

const wrap = (el: React.ReactNode) => (
  <Suspense fallback={<RouteFallback />}>{el}</Suspense>
);

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
        { path: 'settings', element: wrap(<Settings />) },
      ],
    },
  ],
  { basename: adminBase },
);

export function App() {
  return <RouterProvider router={router} />;
}
