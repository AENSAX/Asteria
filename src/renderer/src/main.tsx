import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { applySavedLanguage } from "./utils/language";
import { applySavedTheme } from "./utils/themes";
import "./styles.css";

applySavedLanguage();
applySavedTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
