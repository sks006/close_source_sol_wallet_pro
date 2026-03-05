"use client";

import { type VaultInfo } from "@/hooks/useVault";
import { shortenAddress, lamportsToSol } from "@sol-wallet/sdk";

interface Props {
  vault: VaultInfo | null;
  loading: boolean;
}

export default function VaultHeader({ vault, loading }: Props) {
  if (loading) {
    return (
      <div className="border border-zinc-800 rounded-lg p-6 animate-pulse space-y-3">
        <div className="h-3 w-32 bg-zinc-800 rounded" />
        <div className="h-8 w-48 bg-zinc-800 rounded" />
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="border border-dashed border-zinc-800 rounded-lg p-8 text-center">
        <p className="text-zinc-600 text-sm">No vault connected.</p>
        <p className="text-zinc-700 text-xs mt-1">
          Deploy the program and initialise a vault first.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-6 bg-zinc-900/40">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mb-1">
            Vault Balance
          </p>
          <p className="text-3xl font-bold text-emerald-400 tabular-nums">
            ◎ {lamportsToSol(vault.balanceLamports)}
          </p>
        </div>
        <div className="text-right space-y-1">
          <p className="text-zinc-500 text-xs">
            <span className="text-zinc-400">PDA</span>{" "}
            <span className="font-mono">{shortenAddress(vault.address, 6)}</span>
          </p>
          <p className="text-zinc-500 text-xs">
            <span className="text-zinc-400">Threshold</span>{" "}
            <span className="text-zinc-200">
              {vault.threshold} / {vault.ownerCount}
            </span>
          </p>
          <p className="text-zinc-500 text-xs">
            <span className="text-zinc-400">Tx count</span>{" "}
            <span className="text-zinc-200">{vault.txCount.toString()}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
