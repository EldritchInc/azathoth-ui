import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/hanken-grotesk";
import "./styles/tokens.css";
import "./styles/global.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("The page has no #root to render the editor into.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
