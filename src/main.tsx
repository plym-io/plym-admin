import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App';
import { detectEditionOnce } from './store/cloud';
import { useThemeStore, watchSystemTheme } from './store/theme';
import './styles/globals.css';

// OSS or plym cloud. Started here so it runs alongside the session check
// rather than after it — the shell needs the answer before it can draw.
void detectEditionOnce();

// The inline script in index.html already painted the theme; touching the
// store here just reconciles it, and starts following the OS if that's the
// standing preference.
useThemeStore.getState();
watchSystemTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      gap={8}
      toastOptions={{
        style: {
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-fg)',
          fontFamily: 'var(--font-sans)',
          boxShadow: 'var(--shadow-md)',
        },
      }}
    />
  </StrictMode>,
);
