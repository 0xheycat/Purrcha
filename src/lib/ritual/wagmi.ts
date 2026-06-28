import { http, createConfig, createStorage, noopStorage } from "wagmi";
import { injected } from "wagmi/connectors";
import { RITUAL_CHAIN } from "./constants";

/**
 * wagmi v3 config for Ritual Chain (ID 1979).
 * Only the injected connector (MetaMask / Rabby / Browser wallet) is used — no WalletConnect,
 * no paid services. The public RPC is browser-accessible so no proxy is needed.
 *
 * Note: wagmi v3 removed `safeLocalStorage`. We use `noopStorage` as the SSR-safe fallback
 * (wagmi keeps connection state in-memory; reconnect happens on the client via the injected
 * connector's `shimDisconnect` flag). This avoids hydration mismatches.
 */
export const wagmiConfig = createConfig({
  chains: [RITUAL_CHAIN],
  connectors: [
    injected({ shimDisconnect: true }),
  ],
  multiInjectedProviderDiscovery: true,
  storage: createStorage({
    storage: typeof window !== "undefined" ? window.localStorage : noopStorage,
    key: "purrcha.wagmi",
  }),
  ssr: true,
  transports: {
    [RITUAL_CHAIN.id]: http("https://rpc.ritualfoundation.org", {
      batch: { wait: 64 },
      retryCount: 3,
    }),
  },
});

export const chainId = RITUAL_CHAIN.id;
