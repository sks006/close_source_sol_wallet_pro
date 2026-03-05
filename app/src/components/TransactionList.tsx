"use client";

import { type TxRecord } from "@/hooks/useVault";
import { lamportsToSol, shortenAddress, txStatusLabel, TxStatus } from "@sol-wallet/sdk";

interface Props {
  transactions: TxRecord[];
  loading: boolean;
  threshold: number;
  onAction: () => void;
}

const STATUS_STYLES: Record<number, string> = {
  [TxStatus.Pending]:   "bg-yellow-900/40 text-yellow-400 border-yellow-800",
  [TxStatus.Approved]:  "bg-blue-900/40 text-blue-400 border-blue-800",
  [TxStatus.Executed]:  "bg-emerald-900/40 text-emerald-400 border-emerald-800",
  [TxStatus.Cancelled]: "bg-zinc-800 text-zinc-500 border-zinc-700",
  [TxStatus.Rejected]:  "bg-red-900/40 text-red-400 border-red-800",
};

export default function TransactionList({ transactions, loading, threshold, onAction }: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="border border-zinc-800 rounded-lg p-4 animate-pulse">
            <div className="h-3 w-3/4 bg-zinc-800 rounded mb-2" />
            <div className="h-3 w-1/2 bg-zinc-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="border border-dashed border-zinc-800 rounded-lg p-10 text-center">
        <p className="text-zinc-600 text-sm">No transactions yet.</p>
        <p className="text-zinc-700 text-xs mt-1">Propose a transfer to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transactions.map((tx) => (
        <TxCard key={tx.txIndex.toString()} tx={tx} threshold={threshold} onAction={onAction} />
      ))}
    </div>
  );
}

function TxCard({ tx, threshold, onAction }: { tx: TxRecord; threshold: number; onAction: () => void }) {
  const statusStyle = STATUS_STYLES[tx.status] ?? STATUS_STYLES[TxStatus.Pending];
  const canExecute = tx.status === TxStatus.Approved;
  const canApprove = tx.status === TxStatus.Pending;

  return (
    <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30 hover:bg-zinc-900/60 transition-colors">
      <div className="flex items-start justify-between gap-4">
        {/* Left */}
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 text-xs tabular-nums">#{tx.txIndex.toString()}</span>
            <span className={`text-xs px-2 py-0.5 rounded border ${statusStyle}`}>
              {txStatusLabel(tx.status)}
            </span>
          </div>
          <p className="text-zinc-200 font-semibold tabular-nums">
            ◎ {lamportsToSol(tx.amount)}
          </p>
          <p className="text-zinc-500 text-xs truncate">
            → <span className="font-mono">{shortenAddress(tx.to, 8)}</span>
          </p>
          {tx.memo && (
            <p className="text-zinc-600 text-xs italic truncate">"{tx.memo}"</p>
          )}
        </div>

        {/* Right — approvals + actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {/* Approval bar */}
          <div className="flex items-center gap-1">
            {[...Array(threshold)].map((_, i) => (
              <div
                key={i}
                className={`w-2.5 h-2.5 rounded-full border ${
                  i < tx.approvalCount
                    ? "bg-emerald-400 border-emerald-400"
                    : "bg-transparent border-zinc-600"
                }`}
              />
            ))}
            <span className="text-zinc-500 text-xs ml-1">
              {tx.approvalCount}/{threshold}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            {canApprove && (
              <>
                <button
                  onClick={onAction}
                  className="text-xs px-3 py-1 rounded bg-emerald-900/50 text-emerald-400 border border-emerald-800 hover:bg-emerald-800/50 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={onAction}
                  className="text-xs px-3 py-1 rounded bg-red-900/30 text-red-400 border border-red-900 hover:bg-red-900/50 transition-colors"
                >
                  Reject
                </button>
              </>
            )}
            {canExecute && (
              <button
                onClick={onAction}
                className="text-xs px-3 py-1 rounded bg-blue-900/50 text-blue-400 border border-blue-800 hover:bg-blue-800/50 transition-colors"
              >
                Execute
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
