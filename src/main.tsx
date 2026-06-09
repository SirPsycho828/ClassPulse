import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

console.log(
  '%c' + [
    '╔═╗┬  ┌─┐┌─┐┌─┐╔═╗┬ ┬┬  ┌─┐┌─┐',
    '║  │  ├─┤└─┐└─┐╠═╝│ ││  └─┐├┤ ',
    '╚═╝┴─┘┴ ┴└─┘└─┘╩  └─┘┴─┘└─┘└─┘',
  ].join('\n'),
  'color: #D4915E; font-family: monospace; font-size: 14px;'
);
console.log(
  '%cEvery paper tells a story. Now you can read it.',
  'color: #1E3A5F; font-size: 12px; font-style: italic;'
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
