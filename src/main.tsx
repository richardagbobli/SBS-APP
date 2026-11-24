import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration may be restricted in certain sandboxed iframes; degrade gracefully
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
