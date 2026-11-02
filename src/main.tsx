import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './styles/global.css';
import App from './App';
import { loadThemeMode, setThemeMode } from './lib/theme';

setThemeMode(loadThemeMode());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
