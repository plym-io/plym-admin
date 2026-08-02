import { createBrowserRouter, RouterProvider } from 'react-router';
import { Suspense, lazy } from 'react';
import { adminBase } from '@/lib/base';
import { AppShell } from '@/components/layout/AppShell';
import { RequireAuth } from '@/components/layout/RequireAuth';
import { RouteFallback } from '@/components/layout/RouteFallback';
import { Placeholder } from '@/routes/placeholder';
import { NAV } from '@/components/layout/nav';

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

const wrap = (el: React.ReactNode) => (
  <Suspense fallback={<RouteFallback />}>{el}</Suspense>
);

/**
 * Sections that are in the nav but not built yet. Each gets a real route so
 * the link works, deep-links resolve and the back button behaves — they just
 * land on a page that says what will live there.
 */
const STUBS: Record<string, { description: string; hint: string }> = {
  '/mcp': {
    description: 'Let assistants read and write this site over the Model Context Protocol.',
    hint: 'Connection details and per-client tokens will be managed here.',
  },
  '/api': {
    description: 'Programmatic access to posts, media and everything else.',
    hint: 'API keys and the endpoint reference will live here.',
  },
  '/domain': {
    description: 'The address this site answers on.',
    hint: 'Custom domains, DNS records and certificates will be set up here.',
  },
  '/analytics': {
    description: 'How the site is doing.',
    hint: 'Traffic, referrers and per-post performance will be reported here.',
  },
  '/data': {
    description: 'Your content, in your hands.',
    hint: 'Exports, imports and backups will be handled here.',
  },
  '/support': {
    description: 'Help with plym.',
    hint: 'Docs, diagnostics and a way to reach a human will be here.',
  },
};

const stubRoutes = NAV.flatMap((g) => g.items)
  .filter((item) => item.to in STUBS)
  .map((item) => ({
    path: item.to.slice(1),
    element: (
      <Placeholder
        title={item.label}
        icon={item.icon}
        description={STUBS[item.to].description}
        hint={STUBS[item.to].hint}
      />
    ),
  }));

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
        ...stubRoutes,
      ],
    },
  ],
  { basename: adminBase },
);

export function App() {
  return <RouterProvider router={router} />;
}
