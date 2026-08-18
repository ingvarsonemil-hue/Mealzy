import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '../index.css';

import React from 'react';
import { createRoot } from 'react-dom/client';
import PlanPage from './PlanPage';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PlanPage />
  </React.StrictMode>
);
