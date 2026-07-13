import '@fontsource/fraunces/latin-700-italic.css';
import '@fontsource/fraunces/latin-900-italic.css';
import '@fontsource/fraunces/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '../index.css';

import React from 'react';
import { createRoot } from 'react-dom/client';
import ResetPasswordPage from './ResetPasswordPage';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ResetPasswordPage />
  </React.StrictMode>
);
