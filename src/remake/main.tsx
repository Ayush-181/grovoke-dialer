import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./remake.css";
import "./mac-theme.css";
import "./mac-components.css";
import "./mac-layout.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
