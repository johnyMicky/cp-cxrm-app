import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Chat PWA metadata is injected here so the existing index.html does not need
// to be edited. This keeps the normal CRM bundle/routing unchanged.
const manifestLink = document.createElement('link');
manifestLink.rel = 'manifest';
manifestLink.href = '/chat-manifest.webmanifest';
document.head.appendChild(manifestLink);

const themeMeta = document.createElement('meta');
themeMeta.name = 'theme-color';
themeMeta.content = '#050811';
document.head.appendChild(themeMeta);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/chat-sw.js', { scope: '/chat-app' })
      .catch(error => console.error('Chat PWA service worker registration failed:', error));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
