import {createRoot} from 'react-dom/client';
import {Capacitor} from '@capacitor/core';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import '@fontsource-variable/figtree';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/700-italic.css';
import '@fontsource/barlow-condensed/800-italic.css';
import './index.css';
import {removeLegacySeedData} from './lib/legacy';
import {installErrorLog} from './lib/diagnostics';
import {installNetGuard} from './lib/netGuard';

installErrorLog();
// Every request the app makes is checked against the allowed services and logged (Settings > Privacy & data).
installNetGuard();

// Must run before App mounts so persisted state is read already cleaned.
try {
  removeLegacySeedData(localStorage);
} catch {
  // Storage unavailable (private mode): nothing persisted to clean.
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

// Offline support + installability. Only in production builds so dev HMR isn't cached.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration can fail on http:// or in private windows; the app still works online.
    });
  });
}
