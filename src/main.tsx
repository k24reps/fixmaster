import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initTheme } from './stores/theme';
import { initSettings } from './stores/settings';
import './styles/global.css';

initTheme();
initSettings();

// DEV-ONLY: expose a demo-seed helper for Playwright + manual testing.
// Tree-shaken from production builds via the import.meta.env.DEV guard.
if (import.meta.env.DEV) {
  void import('./dev/seed').then(({ seedDemoWorkspace }) => {
    (window as unknown as { __fixmasterSeed?: () => Promise<void> }).__fixmasterSeed = seedDemoWorkspace;
  });
  void import('./data').then(({ repository }) => {
    (window as unknown as { __repo?: unknown }).__repo = repository;
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
