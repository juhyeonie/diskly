import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

async function boot() {
  if (!window.diskly) await import('./mock.js');
  else if (window.diskly.material) document.documentElement.dataset.material = window.diskly.material;
  const { default: App } = await import('./App.jsx');
  createRoot(document.getElementById('root')).render(<App />);
}
boot();
