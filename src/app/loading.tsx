/**
 * Loading boundary — shown while the page is loading (SSR/streaming).
 * Keeps the dark terminal aesthetic consistent.
 */

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-2 border-gray-800 border-t-ritual-green animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-mono text-ritual-green text-glow-green text-sm">▰</span>
          </div>
        </div>
        <div className="text-center">
          <div className="font-display text-lg text-gray-100 tracking-tight">PURRCHA</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-gray-600 mt-1">
            initializing · ritual chain
          </div>
        </div>
      </div>
    </div>
  );
}
