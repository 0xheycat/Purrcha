"use client";

/**
 * Error boundary — catches unexpected runtime errors and shows a graceful
 * fallback UI instead of a blank white screen.
 *
 * This catches errors that occur during rendering, in lifecycle methods,
 * and in constructors of the whole tree below it.
 */

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to the console for debugging
    console.error("[Purrcha Error Boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="terminal-card p-6 max-w-lg w-full border-ritual-red/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-ritual-red/10 border border-ritual-red/30 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-ritual-red" />
          </div>
          <div>
            <h2 className="font-display text-lg text-gray-100 tracking-tight">
              Runtime Error
            </h2>
            <p className="font-mono text-[10px] uppercase tracking-wider text-gray-500">
              purrcha · error_boundary
            </p>
          </div>
        </div>

        <p className="font-mono text-[12px] text-gray-400 leading-relaxed mb-4">
          An unexpected error occurred. The error has been logged. You can try
          reloading the page or returning to the previous state.
        </p>

        {error.message && (
          <div className="mb-4 p-3 rounded-md bg-ritual-red/5 border border-ritual-red/20">
            <p className="font-mono text-[11px] text-ritual-red/80 break-words">
              {error.message}
            </p>
            {error.digest && (
              <p className="font-mono text-[9px] text-gray-600 mt-1">
                digest: {error.digest}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-black bg-gradient-to-r from-ritual-green to-ritual-lime px-4 py-2 rounded font-semibold hover:shadow-lg hover:shadow-ritual-green/30 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Try Again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-gray-400 border border-gray-700 hover:border-gray-500 hover:text-gray-200 px-4 py-2 rounded transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
}
