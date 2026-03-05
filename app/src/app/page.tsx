"use client";

import { useState } from "react";
import VaultHeader from "@/components/VaultHeader";
import TransactionList from "@/components/TransactionList";
import ProposeModal from "@/components/ProposeModal";
import OwnersPanel from "@/components/OwnersPanel";
import { useVault } from "@/hooks/useVault";

export default function TreasuryDashboard() {
  const [proposeOpen, setProposeOpen] = useState(false);
  const { vault, transactions, loading, refresh } = useVault();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      {/* Top bar */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-emerald-400 text-xl font-bold tracking-tight">◎</span>
          <span className="text-zinc-100 font-semibold tracking-widest uppercase text-sm">
            sol-wallet
          </span>
          <span className="text-zinc-600 text-xs ml-2">multi-sig treasury</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-500">
            {vault ? `${vault.threshold}/${vault.ownerCount} required` : "—"}
          </span>
          <button
            onClick={refresh}
            className="text-zinc-400 hover:text-zinc-100 text-xs border border-zinc-700 px-3 py-1 rounded hover:border-zinc-500 transition-colors"
          >
            refresh
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-[1fr_300px] gap-8">
        {/* Left column */}
        <div className="space-y-6">
          <VaultHeader vault={vault} loading={loading} />

          <div className="flex items-center justify-between">
            <h2 className="text-zinc-400 text-xs uppercase tracking-widest">
              Transactions
            </h2>
            <button
              onClick={() => setProposeOpen(true)}
              className="text-xs bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-4 py-2 rounded transition-colors"
            >
              + Propose Transfer
            </button>
          </div>

          <TransactionList
            transactions={transactions}
            loading={loading}
            threshold={vault?.threshold ?? 1}
            onAction={refresh}
          />
        </div>

        {/* Right column */}
        <aside className="space-y-4">
          <OwnersPanel owners={vault?.owners ?? []} loading={loading} />
        </aside>
      </div>

      {proposeOpen && (
        <ProposeModal
          vault={vault}
          onClose={() => setProposeOpen(false)}
          onSuccess={() => { setProposeOpen(false); refresh(); }}
        />
      )}
    </main>
  );
}
