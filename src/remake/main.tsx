import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./remake.css";
import "./mac-theme.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
