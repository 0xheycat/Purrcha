"use client";

/**
 * Sidebar — professional left-side navigation for the Purrcha dashboard.
 *
 * Navigation items:
 *   - Chat (composer + response stream)
 *   - History (conversation timeline)
 *   - Execution (lifecycle rail)
 *   - Agents (always-on agent + scheduler — diagnostics only)
 *   - Settings (provider config, privacy, etc.)
 *
 * On mobile: collapses to a bottom navigation bar.
 */

import { useNavigationStore, type DashboardView } from "@/stores/navigationStore";
import { MessageSquare, History, Activity, Bot, Settings, Zap } from "lucide-react";
import { useAccount } from "wagmi";

interface NavItem {
  id: DashboardView;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "chat", label: "Chat", icon: <MessageSquare className="w-4 h-4" /> },
  { id: "history", label: "History", icon: <History className="w-4 h-4" /> },
  { id: "verification", label: "Execution", icon: <Activity className="w-4 h-4" /> },
  { id: "settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
];

const DIAGNOSTICS_ITEMS: NavItem[] = [
  { id: "agents", label: "Agents", icon: <Bot className="w-4 h-4" />, badge: "DEV" },
];

export function Sidebar() {
  const { activeView, setView } = useNavigationStore();
  const { isConnected } = useAccount();
  const diagnosticsEnabled = process.env.NEXT_PUBLIC_ENABLE_DIAGNOSTICS === "true";

  if (!isConnected) return null;

  const allItems = [...NAV_ITEMS, ...(diagnosticsEnabled ? DIAGNOSTICS_ITEMS : [])];

  return (
    <>
      {/* Desktop sidebar — left side */}
      <nav
        className="hidden lg:flex flex-col w-16 xl:w-48 border-r border-gray-800 bg-ritual-elevated/30 h-full"
        aria-label="Dashboard navigation"
      >
        {/* Logo */}
        <div className="p-3 border-b border-gray-800 flex items-center justify-center xl:justify-start">
          <span className="font-display text-lg text-ritual-green text-glow-green">▰</span>
          <span className="hidden xl:inline font-display text-sm text-gray-100 ml-2">PURRCHA</span>
        </div>

        {/* Nav items */}
        <div className="flex-1 py-2 space-y-1">
          {allItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all group ${
                activeView === item.id
                  ? "bg-ritual-green/10 border-l-2 border-ritual-green text-ritual-green"
                  : "border-l-2 border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/30"
              }`}
              aria-current={activeView === item.id ? "page" : undefined}
              aria-label={item.label}
            >
              <span className={`flex-shrink-0 ${activeView === item.id ? "text-ritual-green" : "text-gray-500 group-hover:text-gray-300"}`}>
                {item.icon}
              </span>
              <span className="hidden xl:inline font-mono text-[11px] uppercase tracking-wider font-semibold">
                {item.label}
              </span>
              {item.badge && (
                <span className="hidden xl:inline font-mono text-[8px] uppercase text-ritual-pink px-1 py-0.5 rounded border border-ritual-pink/30">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-800">
          <div className="flex items-center justify-center xl:justify-start gap-1.5">
            <Zap className="w-3 h-3 text-ritual-green animate-pulse" />
            <span className="hidden xl:inline font-mono text-[9px] uppercase tracking-wider text-gray-600">
              ritual chain
            </span>
          </div>
        </div>
      </nav>

      {/* Mobile bottom navigation */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-ritual-elevated/95 backdrop-blur-md border-t border-gray-800 flex items-center justify-around h-14"
        aria-label="Mobile navigation"
      >
        {allItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 transition-colors ${
              activeView === item.id ? "text-ritual-green" : "text-gray-600"
            }`}
            aria-current={activeView === item.id ? "page" : undefined}
            aria-label={item.label}
          >
            <span className={activeView === item.id ? "text-ritual-green" : "text-gray-600"}>
              {item.icon}
            </span>
            <span className="font-mono text-[8px] uppercase tracking-wider">
              {item.label}
            </span>
          </button>
        ))}
      </nav>
    </>
  );
}
