"use client";

import * as React from "react";
import { useAccount } from "wagmi";
import { StatusBar } from "@/components/ritual/StatusBar";
import { Sidebar } from "@/components/ritual/Sidebar";
import { Composer } from "@/components/ritual/Composer";
import { ResponseStream } from "@/components/ritual/ResponseStream";
import { ConversationTimeline } from "@/components/ritual/ConversationTimeline";
import { LifecycleRail } from "@/components/ritual/LifecycleRail";
import { VerificationDrawer } from "@/components/ritual/VerificationDrawer";
import { PrecompileStatusBar } from "@/components/ritual/PrecompileStatusBar";
import { SettingsPanel } from "@/components/ritual/SettingsPanel";
import { KeyboardShortcuts } from "@/components/ritual/KeyboardShortcuts";
import { CommandPalette } from "@/components/ritual/CommandPalette";
import { OnboardingWizard, hasCompletedOnboarding } from "@/components/ritual/OnboardingWizard";
import { AgentLogsPanel } from "@/components/ritual/AgentLogsPanel";
import { SchedulerPanel } from "@/components/ritual/SchedulerPanel";
import { AlwaysOnAgentPanel } from "@/components/ritual/AlwaysOnAgentPanel";
import { ContractInspector } from "@/components/ritual/ContractInspector";
import { GenesisLeaderboard } from "@/components/ritual/GenesisLeaderboard";
import { ToastContainer, toast } from "@/components/ritual/Toast";
import { useAutoRefill } from "@/hooks/ritual/useAutoRefill";
import { useBalanceManager } from "@/hooks/ritual/useBalanceManager";
import { useComposerStore } from "@/stores/composerStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useAsyncJobEvents } from "@/hooks/ritual/useAsyncJobEvents";
import { useAutoSwitchNetwork } from "@/hooks/ritual/useAutoSwitchNetwork";
import { isContractDeployed, PURRCHA_CHAT_ADDRESS } from "@/lib/ritual/abi";
import { RITUAL_CHAIN } from "@/lib/ritual/constants";
import { HowItWorks } from "@/components/ritual/HowItWorks";
import { PrivacyScoreDashboard } from "@/components/ritual/PrivacyScoreDashboard";
import { NetworkStatusWidget } from "@/components/ritual/NetworkStatusWidget";
import { PromptTemplates } from "@/components/ritual/PromptTemplates";
import { PrivacyShield } from "@/components/ritual/PrivacyShield";
import { Activity, Shield, Cpu, Zap, Lock, Eye, ChevronRight, Settings } from "lucide-react";

export default function Home() {
  const { isConnected } = useAccount();
  const [bannerDismissed, setBannerDismissed] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [onboardingOpen, setOnboardingOpen] = React.useState(false);
  const diagnosticsEnabled = process.env.NEXT_PUBLIC_ENABLE_DIAGNOSTICS === "true";

  useAsyncJobEvents();
  useAutoSwitchNetwork();
  useAutoRefill();
  useBalanceManager();

  React.useEffect(() => {
    if (!hasCompletedOnboarding()) setOnboardingOpen(true);
  }, []);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if (e.key.toLowerCase() === "s") {
        setSettingsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const fillPrompt = React.useCallback((prompt: string, mode: "llm" | "image") => {
    useComposerStore.getState().setPrompt(prompt);
    useComposerStore.getState().setMode(mode);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-bg text-gray-400">
      <StatusBar onOpenSettings={() => setSettingsOpen(true)} onOpenCommandPalette={() => setCommandPaletteOpen(true)} />
      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
      <KeyboardShortcuts open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onFillPrompt={fillPrompt}
      />
      <OnboardingWizard key={`onboarding-${onboardingOpen}`} open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />

      {!isContractDeployed && !bannerDismissed && (
        <div className="bg-ritual-gold/5 border-b border-ritual-gold/30 px-4 py-2 flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ritual-gold flex-shrink-0">⚠ contract_not_deployed</span>
          <span className="font-mono text-[11px] text-gray-400 flex-1 min-w-0 truncate">
            Set <code className="text-ritual-lime">NEXT_PUBLIC_PURRCHA_CHAT_ADDRESS</code> after deploying.
          </span>
          <button type="button" onClick={() => setBannerDismissed(true)} className="font-mono text-[10px] text-gray-500 hover:text-gray-300 flex-shrink-0" aria-label="Dismiss banner">✕</button>
        </div>
      )}

      {/* === LANDING PAGE (disconnected) === */}
      {!isConnected && <LandingPage onFillPrompt={fillPrompt} />}

      {/* === DASHBOARD (connected) === */}
      {isConnected && <Dashboard diagnosticsEnabled={diagnosticsEnabled} />}

      <ToastContainer />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LANDING PAGE — premium onboarding interface for disconnected users
// ═══════════════════════════════════════════════════════════════════════════

function LandingPage({ onFillPrompt }: { onFillPrompt: (p: string, m: "llm" | "image") => void }) {
  return (
    <main className="flex-1 min-h-0 relative">
      <div className="absolute inset-0 z-20 bg-bg flex items-center justify-center p-4 sm:p-8 overflow-y-auto">
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-ritual-green/5 blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-ritual-pink/5 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        </div>

        <div className="relative max-w-4xl w-full space-y-6 fade-in">
          {/* Logo + shield */}
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <PrivacyShield />
            <div className="text-center sm:text-left flex-1 space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-ritual-green/30 bg-ritual-green/5">
                <span className="w-1.5 h-1.5 rounded-full bg-ritual-green animate-pulse" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ritual-green">ritual chain · live</span>
              </div>
              <div className="font-display text-4xl sm:text-5xl tracking-tight leading-none">
                <span className="text-ritual-green text-glow-green">▰</span>{" "}
                <span className="text-gray-100">PURRCHA</span>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-gray-500">private · multimodal · on-chain</div>
            </div>
          </div>

          {/* Tagline */}
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <p className="font-body text-sm sm:text-base text-gray-300 leading-relaxed">
              A private multi-modal ChatGPT running entirely on{" "}
              <span className="text-ritual-green font-semibold">Ritual Chain</span>.
              TEE-secured LLM + Image precompiles. ECIES-encrypted history. On-chain verifiable receipts.
            </p>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FeatureCard icon="◇" color="green" title="LLM 0x0802" body="zai-org/GLM-4.7-FP8 inference in a Ritual TEE executor. Short-running async — result lands in the same tx receipt." />
            <FeatureCard icon="◆" color="pink" title="Image 0x0818" body="FLUX.2-klein-4B image generation. Long-running async — callback delivery, settled on-chain via ImageResultDelivered." />
            <FeatureCard icon="▰" color="gold" title="ECIES History" body="Every prompt/response is encrypted with a keypair derived from your wallet signature. Private key never leaves your browser." />
          </div>

          {/* How it works */}
          <HowItWorks />

          {/* Status widgets */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <PrivacyScoreDashboard />
            <NetworkStatusWidget />
            <GenesisLeaderboard />
          </div>

          {/* Prompt templates */}
          <PromptTemplates onSelect={onFillPrompt} />

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <div className="inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.15em] text-black bg-gradient-to-r from-ritual-green to-ritual-lime px-6 h-12 rounded-md font-bold shadow-lg shadow-ritual-green/30 hover:shadow-ritual-green/50 hover:scale-[1.02] transition-all">
              <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
              Connect wallet via the top-right button to begin
            </div>
          </div>

          <div className="text-center pt-2">
            <div className="inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-gray-600">
              <span>chain id 1979</span>
              <span className="text-gray-800">·</span>
              <span className="truncate max-w-[280px]">{RITUAL_CHAIN.rpcUrls.default.http[0]}</span>
              <span className="text-gray-800">·</span>
              <span>contract {PURRCHA_CHAT_ADDRESS ? `${PURRCHA_CHAT_ADDRESS.slice(0, 8)}…${PURRCHA_CHAT_ADDRESS.slice(-4)}` : "not deployed"}</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function FeatureCard({ icon, color, title, body }: { icon: string; color: "green" | "pink" | "gold"; title: string; body: string }) {
  const colorClass = color === "green" ? "text-ritual-green border-ritual-green/40 hover:border-ritual-green/70 hover:glow-green"
    : color === "pink" ? "text-ritual-pink border-ritual-pink/40 hover:border-ritual-pink/70 hover:glow-pink"
    : "text-ritual-gold border-ritual-gold/40 hover:border-ritual-gold/70 hover:glow-gold";
  const glowBg = color === "green" ? "bg-ritual-green/5" : color === "pink" ? "bg-ritual-pink/5" : "bg-ritual-gold/5";
  return (
    <div className={`terminal-card p-4 border ${colorClass} ${glowBg} transition-all duration-200 group`}>
      <div className="font-mono text-2xl mb-2 group-hover:scale-110 transition-transform">{icon}</div>
      <div className="font-mono text-[11px] uppercase tracking-wider mb-1.5 font-semibold">{title}</div>
      <p className="font-mono text-[10px] text-gray-400 leading-relaxed">{body}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD — connected app workspace with sidebar navigation
// ═══════════════════════════════════════════════════════════════════════════

function Dashboard({ diagnosticsEnabled }: { diagnosticsEnabled: boolean }) {
  const { activeView } = useNavigationStore();

  return (
    <div className="flex-1 flex min-h-0">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0 pb-14 lg:pb-0">
        {/* Content based on active view */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeView === "chat" && <ChatView />}
          {activeView === "history" && <HistoryView />}
          {activeView === "verification" && <ExecutionView />}
          {activeView === "agents" && diagnosticsEnabled && <AgentsView />}
          {activeView === "settings" && <SettingsView onOpenSettings={() => {}} />}
        </div>

        {/* Bottom status bar */}
        <PrecompileStatusBar />
      </main>
    </div>
  );
}

// ─── Chat View ───
function ChatView() {
  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 p-3 overflow-hidden">
      {/* Center: composer + response */}
      <div className="flex flex-col gap-3 min-w-0 overflow-y-auto scrollbar-thin">
        <Composer />
        <ResponseStream />
      </div>

      {/* Right: lifecycle rail (compact) */}
      <div className="hidden lg:block overflow-y-auto scrollbar-thin">
        <LifecycleRail />
      </div>
    </div>
  );
}

// ─── History View ───
function HistoryView() {
  return (
    <div className="h-full p-3 overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto">
        <ConversationTimeline />
      </div>
    </div>
  );
}

// ─── Execution View ───
function ExecutionView() {
  return (
    <div className="h-full p-3 overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto">
        <LifecycleRail />
      </div>
    </div>
  );
}

// ─── Agents View (diagnostics only) ───
function AgentsView() {
  return (
    <div className="h-full p-3 overflow-y-auto scrollbar-thin space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ritual-pink/50 mb-2">▸ developer_diagnostics</div>
      <ContractInspector />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <AgentLogsPanel />
        <SchedulerPanel />
      </div>
      <AlwaysOnAgentPanel />
    </div>
  );
}

// ─── Settings View ───
function SettingsView({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="h-full p-3 overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="terminal-card p-6 text-center">
          <Settings className="w-8 h-8 text-ritual-green mx-auto mb-3" />
          <h2 className="font-display text-lg text-gray-100 mb-2">Settings</h2>
          <p className="font-mono text-[11px] text-gray-500 mb-4">
            Configure your Purrcha provider mode, privacy, and developer settings.
          </p>
          <button
            type="button"
            onClick={onOpenSettings}
            className="font-mono text-[11px] uppercase tracking-wider text-black bg-gradient-to-r from-ritual-green to-ritual-lime px-4 py-2 rounded font-semibold hover:shadow-lg hover:shadow-ritual-green/30 transition-all"
          >
            Open Settings Panel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Footer ───
function Footer({ onOpenShortcuts }: { onOpenShortcuts: () => void }) {
  return (
    <footer className="mt-auto border-t border-gray-800 bg-bg px-4 py-3 hidden lg:block">
      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.1em] text-gray-600">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">PURRCHA</span>
          <span className="text-gray-700">·</span>
          <span>private multimodal chatgpt on-chain</span>
          <span className="text-gray-700">·</span>
          <span className="text-ritual-green">ritual chain 1979</span>
        </div>
        <div className="flex items-center gap-3">
          <a href={RITUAL_CHAIN.blockExplorers.default.url} target="_blank" rel="noreferrer" className="hover:text-ritual-green transition-colors">↗ explorer</a>
          <a href="https://docs.ritual.net" target="_blank" rel="noreferrer" className="hover:text-ritual-green transition-colors">↗ ritual docs</a>
          <button type="button" onClick={onOpenShortcuts} className="hover:text-ritual-green transition-colors inline-flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border border-gray-700 text-[9px] text-gray-500">?</kbd>shortcuts
          </button>
          {PURRCHA_CHAT_ADDRESS && (
            <span className="text-gray-700 hidden md:inline" title={PURRCHA_CHAT_ADDRESS}>
              contract {`${PURRCHA_CHAT_ADDRESS.slice(0, 8)}…${PURRCHA_CHAT_ADDRESS.slice(-4)}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-gray-500">
          <span className="text-ritual-green">●</span> TEE-secured
          <span className="text-gray-700">·</span>
          <span className="text-ritual-green">●</span> ECIES-encrypted
          <span className="text-gray-700">·</span>
          <span className="text-ritual-green">●</span> on-chain verified
        </div>
      </div>
    </footer>
  );
}
