import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/hanken-grotesk";
import "./styles/tokens.css";
import "./styles/global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import { App } from "./App";
import { makeQueryClient } from "./queries";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("The page has no #root to render the editor into.");
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={makeQueryClient()}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
