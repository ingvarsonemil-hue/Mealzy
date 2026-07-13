/* Self-hosted fonts via @fontsource — explicit weights only.
 * Fraunces italic carries the headings; Inter carries the body. */
import '@fontsource/fraunces/latin-700-italic.css';
import '@fontsource/fraunces/latin-900-italic.css';
import '@fontsource/fraunces/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './index.css';

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
