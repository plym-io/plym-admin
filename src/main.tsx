import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      gap={8}
      toastOptions={{
        style: {
          background: 'var(--color-bg-subtle)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-fg)',
          fontFamily: 'var(--font-sans)',
          boxShadow: 'var(--shadow-md)',
        },
      }}
    />
  </StrictMode>,
);
