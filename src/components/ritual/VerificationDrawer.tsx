"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  SYSTEM,
  PRECOMPILES,
  TEE_SERVICE_REGISTRY_ADDRESS,
  WALLET_ADDRESS,
} from "@/lib/ritual/constants";
import { truncateHex, useCopyToClipboard } from "@/hooks/ritual/useChainStatus";

/**
 * VerificationDrawer — slide-in drawer triggered by the "VERIFY" button on each AI response.
 *
 * Shows the on-chain verification proof for a settled transaction:
 *   - Verification status (green ✓ VERIFIED or red ✕ FAILED)
 *   - Transaction hash (mono, full, copy button, explorer link)
 *   - Precompile used (name + address, geometric icon)
 *   - Contract event reference (logIndex, topics)
 *   - Async job/result ID (if image)
 *   - TEE attestation section: "IMPLICIT TEE VERIFICATION" with the explanation that Ritual's
 *     TEE trust comes from the executor registry + chain-verified settlement
 *   - Raw proof/attestation expandable section (raw spcCalls input/output hex, decoded fields)
 *   - Human-readable explanation paragraph
 *
 * The data comes from GET /api/verify?txHash=0x...
 */

interface VerifyApiResponse {
  txHash: string;
  status: "success" | "reverted" | string;
  statusLabel: string;
  blockNumber: string;
  gasUsed: string;
  effectiveGasPrice: string;
  from?: string;
  to?: string;
  contractAddress?: string | null;
  interactedWithContract?: boolean;
  precompileUsed?: string | null;
  precompileAddress?: string | null;
  spcCalls?: Array<{ input: string; output: string }>;
  spcDecoded?: {
    precompile?: string;
    kind?: string;
    hasError?: boolean;
    errorMessage?: string;
    text?: string;
    outputUri?: string;
  } | null;
  contractEvent?: { name: string; args: { topics: string[]; data: string; logIndex: number } } | null;
  logs?: Array<{ address: string; topics: string[]; data: string; logIndex: number }>;
  teeAttestation?: {
    available: boolean;
    reason: string;
    executorRegistry: string;
    asyncDelivery: string;
  };
  verificationStatus: string;
  humanReadable: string;
  error?: string;
  message?: string;
}

export interface VerificationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  txHash: string | null;
}

export function VerificationDrawer({ open, onOpenChange, txHash }: VerificationDrawerProps) {
  const { copied, copy } = useCopyToClipboard();
  const [rawExpanded, setRawExpanded] = React.useState(false);

  const { data, isLoading, error } = useQuery<VerifyApiResponse>({
    queryKey: ["purrcha", "verify", txHash],
    queryFn: async () => {
      if (!txHash) throw new Error("No tx hash");
      const res = await fetch(`/api/verify?txHash=${txHash}`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as Partial<VerifyApiResponse>;
      if (!res.ok) {
        throw new Error(body?.message ?? body?.error ?? `Verify failed (${res.status})`);
      }
      return body as VerifyApiResponse;
    },
    enabled: Boolean(txHash) && open,
    retry: 0,
    staleTime: 60_000,
  });

  // Reset raw expansion when drawer opens.
  React.useEffect(() => {
    if (open) setRawExpanded(false);
  }, [open]);

  const isVerified = data?.verificationStatus === "verified";
  const explorerUrl = txHash
    ? `https://explorer.ritualfoundation.org/tx/${txHash}`
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl bg-bg border-gray-800 p-0 overflow-y-auto scrollbar-thin"
      >
        <SheetHeader className="px-5 py-4 border-b border-gray-800 space-y-1">
          <SheetTitle className="font-display text-base text-gray-100 tracking-wide">
            On-chain Verification
          </SheetTitle>
          <SheetDescription className="font-mono text-[11px] text-gray-500">
            SPC receipt · contract events · TEE attestation
          </SheetDescription>
        </SheetHeader>

        <div className="px-5 py-4 space-y-4">
          {/* Status banner */}
          <div
            className={`rounded-md border p-3 ${
              isLoading
                ? "border-gray-700 bg-elevated"
                : isVerified
                  ? "border-ritual-green/50 bg-ritual-green/5"
                  : "border-ritual-red/50 bg-ritual-red/5"
            }`}
          >
            {isLoading && (
              <div className="font-mono text-[12px] text-gray-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-ritual-gold animate-pulse" />
                Fetching receipt + decoding SPC output…
              </div>
            )}
            {!isLoading && isVerified && (
              <div className="flex items-center gap-2">
                <span className="text-ritual-green text-base">✓</span>
                <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-ritual-green">
                  Verified
                </span>
                <span className="ml-auto font-mono text-[10px] text-gray-500 uppercase tracking-wider">
                  blk {data?.blockNumber ? BigInt(data.blockNumber).toLocaleString() : "—"}
                </span>
              </div>
            )}
            {!isLoading && !isVerified && (
              <div className="flex items-center gap-2">
                <span className="text-ritual-red text-base">✕</span>
                <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-ritual-red">
                  Failed
                </span>
                <span className="ml-auto font-mono text-[10px] text-gray-500 uppercase tracking-wider">
                  {data?.statusLabel ?? "reverted"}
                </span>
              </div>
            )}
          </div>

          {error && (
            <div className="font-mono text-[11px] text-ritual-red border-l-2 border-ritual-red/40 pl-2 break-words">
              {(error as Error).message}
            </div>
          )}

          {data && (
            <>
              {/* Transaction hash */}
              <Section title="Transaction Hash">
                <div className="flex items-start gap-2">
                  <code className="flex-1 font-mono text-[11px] text-gray-300 break-all">
                    {txHash}
                  </code>
                  <button
                    type="button"
                    onClick={() => txHash && copy(txHash)}
                    className="font-mono text-[10px] text-gray-500 hover:text-ritual-green transition-colors flex-shrink-0"
                    aria-label="Copy tx hash"
                  >
                    {copied ? "✓" : "⧉"}
                  </button>
                  {explorerUrl && (
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[10px] text-gray-500 hover:text-ritual-green transition-colors flex-shrink-0"
                      aria-label="View on Ritual explorer"
                    >
                      ↗
                    </a>
                  )}
                </div>
              </Section>

              {/* Precompile used */}
              {data.precompileUsed && (
                <Section title="Precompile">
                  <div className="space-y-1">
                    <div className="font-mono text-[12px] text-ritual-green">
                      {data.precompileAddress === PRECOMPILES.LLM ? "◇ " : data.precompileAddress === PRECOMPILES.IMAGE_CALL ? "◆ " : "▸ "}
                      {data.precompileUsed}
                    </div>
                    {data.precompileAddress && (
                      <div className="font-mono text-[10px] text-gray-500">
                        addr: <span className="text-gray-400">{data.precompileAddress}</span>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Decoded SPC output */}
              {data.spcDecoded && (
                <Section title="SPC Output (decoded)">
                  <div className="space-y-1.5">
                    <div className="font-mono text-[11px] text-gray-400">
                      kind: <span className="text-gray-300">{data.spcDecoded.kind}</span>
                    </div>
                    {data.spcDecoded.hasError ? (
                      <div className="font-mono text-[11px] text-ritual-red border-l-2 border-ritual-red/40 pl-2 break-words">
                        {data.spcDecoded.errorMessage ?? "(no error message)"}
                      </div>
                    ) : data.spcDecoded.text ? (
                      <div className="font-mono text-[12px] text-gray-200 break-words whitespace-pre-wrap border-l-2 border-ritual-pink/40 pl-2 leading-relaxed">
                        {data.spcDecoded.text}
                      </div>
                    ) : data.spcDecoded.outputUri ? (
                      <a
                        href={data.spcDecoded.outputUri}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block font-mono text-[11px] text-ritual-pink hover:underline break-all"
                      >
                        {data.spcDecoded.outputUri}
                      </a>
                    ) : (
                      <div className="font-mono text-[11px] text-gray-500 italic">
                        (no decodable payload)
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Contract event reference */}
              {data.contractEvent && (
                <Section title="Contract Event">
                  <div className="space-y-1 font-mono text-[10px] text-gray-500">
                    <div>name: <span className="text-gray-400">{data.contractEvent.name}</span></div>
                    <div>logIndex: <span className="text-gray-400">{data.contractEvent.args.logIndex}</span></div>
                    <div className="text-gray-600 uppercase tracking-wider mt-1">topics:</div>
                    {data.contractEvent.args.topics.map((t, i) => (
                      <div key={i} className="text-gray-400 break-all">
                        [{i}] {t}
                      </div>
                    ))}
                    <div className="text-gray-600 uppercase tracking-wider mt-1">data:</div>
                    <div className="text-gray-400 break-all">{data.contractEvent.args.data}</div>
                  </div>
                </Section>
              )}

              {/* Gas + block */}
              <Section title="Receipt">
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <div>
                    <span className="text-gray-600 uppercase tracking-wider text-[10px] block">block</span>
                    <span className="text-gray-300">{BigInt(data.blockNumber).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 uppercase tracking-wider text-[10px] block">gas_used</span>
                    <span className="text-gray-300">{BigInt(data.gasUsed).toLocaleString()}</span>
                  </div>
                  {data.from && (
                    <div className="col-span-2">
                      <span className="text-gray-600 uppercase tracking-wider text-[10px] block">from</span>
                      <span className="text-gray-400 break-all">{truncateHex(data.from, 20, 10)}</span>
                    </div>
                  )}
                  {data.to && (
                    <div className="col-span-2">
                      <span className="text-gray-600 uppercase tracking-wider text-[10px] block">to</span>
                      <span className="text-gray-400 break-all">{truncateHex(data.to, 20, 10)}</span>
                    </div>
                  )}
                </div>
              </Section>

              {/* TEE attestation */}
              <Section title="TEE Attestation">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-ritual-gold" />
                    <span className="font-mono text-[11px] uppercase tracking-wider text-ritual-gold">
                      Implicit TEE verification
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-gray-400 leading-relaxed">
                    Ritual Chain TEE attestation is implicit: the executor is registered in
                    TEEServiceRegistry and the settlement is verified by the chain&apos;s
                    commitment validator. No separate attestation blob is exposed in the
                    transaction receipt.
                  </p>
                  <div className="font-mono text-[10px] space-y-1">
                    <div>
                      <span className="text-gray-600 uppercase tracking-wider">executor_registry:</span>{" "}
                      <span className="text-gray-400">{truncateHex(TEE_SERVICE_REGISTRY_ADDRESS, 18, 8)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 uppercase tracking-wider">async_delivery:</span>{" "}
                      <span className="text-gray-400">{truncateHex(SYSTEM.ASYNC_DELIVERY, 18, 8)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 uppercase tracking-wider">ritual_wallet:</span>{" "}
                      <span className="text-gray-400">{truncateHex(WALLET_ADDRESS, 18, 8)}</span>
                    </div>
                  </div>
                </div>
              </Section>

              {/* Raw proof (expandable) */}
              <Section title="Raw Proof">
                <button
                  type="button"
                  onClick={() => setRawExpanded((v) => !v)}
                  className="font-mono text-[10px] uppercase tracking-wider text-gray-500 hover:text-ritual-green transition-colors"
                  aria-expanded={rawExpanded}
                >
                  {rawExpanded ? "▾ hide raw" : "▸ show raw spcCalls hex"}
                </button>
                {rawExpanded && data.spcCalls && (
                  <div className="mt-2 space-y-2 fade-in">
                    {data.spcCalls.map((c, i) => (
                      <div key={i} className="space-y-1">
                        <div className="font-mono text-[10px] text-gray-600 uppercase tracking-wider">
                          call[{i}].input
                        </div>
                        <pre className="font-mono text-[10px] text-gray-400 bg-surface border border-gray-700 rounded p-2 break-all whitespace-pre-wrap max-h-32 overflow-y-auto scrollbar-thin">
                          {c.input}
                        </pre>
                        <div className="font-mono text-[10px] text-gray-600 uppercase tracking-wider mt-1">
                          call[{i}].output
                        </div>
                        <pre className="font-mono text-[10px] text-gray-400 bg-surface border border-gray-700 rounded p-2 break-all whitespace-pre-wrap max-h-32 overflow-y-auto scrollbar-thin">
                          {c.output}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
                {(!data.spcCalls || data.spcCalls.length === 0) && (
                  <div className="mt-2 font-mono text-[10px] text-gray-600 italic">
                    No spcCalls in receipt.
                  </div>
                )}
              </Section>

              {/* Human readable */}
              <Section title="Summary">
                <p className="font-mono text-[12px] text-gray-300 leading-relaxed">
                  {data.humanReadable}
                </p>
              </Section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ───────────────────────── Sub-component ─────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-gray-800 bg-elevated p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-gray-500 mb-2 border-b border-gray-800 pb-1.5">
        {title}
      </div>
      {children}
    </section>
  );
}
