"use client";

import { type Address } from "@solana/kit";
import { shortenAddress } from "@sol-wallet/sdk";

interface Props {
  owners: Address[];
  loading: boolean;
}

export default function OwnersPanel({ owners, loading }: Props) {
  return (
    <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30">
      <h3 className="text-zinc-400 text-xs uppercase tracking-widest mb-3">
        Owners ({owners.length})
      </h3>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-8 bg-zinc-800 rounded animate-pulse" />
          ))}
        </div>
      ) : owners.length === 0 ? (
        <p className="text-zinc-600 text-xs">No vault loaded.</p>
      ) : (
        <ul className="space-y-1">
          {owners.map((owner, i) => (
            <li
              key={owner.toString()}
              className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <span className="text-zinc-600 w-4 tabular-nums">{i + 1}.</span>
              <span className="font-mono">{shortenAddress(owner, 8)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
