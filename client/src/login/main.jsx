import React from "react";
import ReactDOM from "react-dom/client";
import LoginPage from "./LoginPage.jsx";
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import "../index.css"; // your Tailwind entry

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LoginPage />
  </React.StrictMode>
);