import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./remake.css";
import "./mac-theme.css";
import "./mac-overrides.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
