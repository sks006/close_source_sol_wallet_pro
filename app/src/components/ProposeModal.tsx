"use client";

import { useState } from "react";
import { type VaultInfo } from "@/hooks/useVault";
import { isValidAddress, solToLamports, MAX_MEMO_LEN } from "@sol-wallet/sdk";

interface Props {
  vault: VaultInfo | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProposeModal({ vault, onClose, onSuccess }: Props) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toValid = isValidAddress(to);
  const amountValid = parseFloat(amount) > 0;
  const memoValid = memo.length <= MAX_MEMO_LEN;
  const canSubmit = toValid && amountValid && memoValid && !loading;

  async function handleSubmit() {
    if (!canSubmit || !vault) return;
    setLoading(true);
    setError(null);
    try {
      const lamports = solToLamports(amount);
      // TODO: wire up buildProposeTransactionIx + wallet adapter + sendTransaction
      console.log("Proposing", { to, lamports, memo });
      await new Promise((r) => setTimeout(r, 800)); // simulate
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-zinc-100 font-semibold text-sm uppercase tracking-wider">
            Propose Transfer
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Recipient */}
          <div className="space-y-1">
            <label className="text-zinc-400 text-xs uppercase tracking-widest">
              Recipient Address
            </label>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Solana wallet address..."
              className={`w-full bg-zinc-800 border rounded px-3 py-2 text-zinc-100 text-sm font-mono placeholder-zinc-600 focus:outline-none focus:ring-1 transition-colors ${
                to && !toValid
                  ? "border-red-700 focus:ring-red-700"
                  : "border-zinc-700 focus:ring-emerald-500"
              }`}
            />
            {to && !toValid && (
              <p className="text-red-400 text-xs">Invalid address</p>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-1">
            <label className="text-zinc-400 text-xs uppercase tracking-widest">
              Amount (SOL)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 text-sm">
                ◎
              </span>
              <input
                type="number"
                min="0"
                step="0.000000001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-zinc-800 border border-zinc-700 rounded pl-7 pr-3 py-2 text-zinc-100 text-sm tabular-nums placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
            </div>
          </div>

          {/* Memo */}
          <div className="space-y-1">
            <label className="text-zinc-400 text-xs uppercase tracking-widest">
              Memo{" "}
              <span className="text-zinc-600 normal-case">
                (optional, {memo.length}/{MAX_MEMO_LEN})
              </span>
            </label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              placeholder="Reason for transfer..."
              className={`w-full bg-zinc-800 border rounded px-3 py-2 text-zinc-100 text-sm placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 transition-colors ${
                !memoValid
                  ? "border-red-700 focus:ring-red-700"
                  : "border-zinc-700 focus:ring-emerald-500"
              }`}
            />
          </div>

          {/* Info strip */}
          {vault && (
            <div className="bg-zinc-800/60 rounded px-3 py-2 text-xs text-zinc-500">
              Requires{" "}
              <span className="text-zinc-300">
                {vault.threshold} of {vault.ownerCount}
              </span>{" "}
              owner approvals before execution.
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-red-400 text-xs bg-red-900/20 border border-red-900 rounded px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 rounded py-2 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-semibold rounded py-2 text-sm transition-colors"
          >
            {loading ? "Submitting…" : "Propose"}
          </button>
        </div>
      </div>
    </div>
  );
}
