import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

import { SERVER, serving, type Answers } from "./instances";

/**
 * Renders one piece of the editor at one address, with a fresh query client
 * and a fake server answering each API path as `answers` says, or `fetcher`
 * answering every request.
 */
export function renderAt(
  ui: ReactNode,
  {
    path = "/",
    answers = SERVER,
    fetcher,
  }: {
    readonly path?: string;
    readonly answers?: Answers;
    readonly fetcher?: typeof fetch;
  } = {},
): RenderResult {
  vi.stubGlobal("fetch", fetcher ?? serving(answers));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
