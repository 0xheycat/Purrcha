/**
 * Navigation store — manages the active view in the Purrcha dashboard.
 * Views: chat | history | verification | agents | settings
 * Diagnostics view is gated behind NEXT_PUBLIC_ENABLE_DIAGNOSTICS.
 */

import { create } from "zustand";

export type DashboardView = "chat" | "history" | "verification" | "agents" | "settings";

interface NavigationState {
  activeView: DashboardView;
  setView: (view: DashboardView) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activeView: "chat",
  setView: (view) => set({ activeView: view }),
}));
