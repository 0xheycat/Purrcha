"use client";

import * as React from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { wagmiConfig } from "@/lib/ritual/wagmi";

/**
 * Top-level providers for Purrcha.
 *
 * - WagmiProvider (wagmi v3) — wallet + Ritual Chain RPC.
 * - QueryClientProvider (TanStack Query v5) — server-state for /api routes (history, executor, chain).
 * - ThemeProvider (next-themes) — forced dark, no flash. The flagship aesthetic is dark-only.
 *
 * SSR-safe: the QueryClient is created lazily via React state so it is stable across renders
 * and never shared between requests on the server.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Ritual RPC can be slow; be patient but not infinite.
            staleTime: 5_000,
            gcTime: 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" forcedTheme="dark" enableSystem={false} disableTransitionOnChange>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
