import { useState, useEffect, useCallback } from "react";
import { type Address, address, createSolanaRpc } from "@solana/kit";
import {
  PROGRAM_ID,
  VAULT_DISCRIMINATOR,
  TX_RECORD_DISCRIMINATOR,
  TxStatus,
  type TxStatusValue,
  deriveVaultPda,
  deriveTxPda,
} from "@sol-wallet/sdk";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VaultInfo {
  address: Address;
  balanceLamports: bigint;
  owners: Address[];
  ownerCount: number;
  threshold: number;
  txCount: bigint;
  bump: number;
}

export interface TxRecord {
  txIndex: bigint;
  to: Address;
  amount: bigint;
  proposer: Address;
  memo: string;
  approvalCount: number;
  rejectionCount: number;
  status: TxStatusValue;
  createdAt: number;
  executedAt: number | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8899";

/**
 * Fetches vault state and all associated transaction records from the RPC.
 *
 * Usage:
 *   const { vault, transactions, loading, error, refresh } = useVault(creatorAddress);
 */
export function useVault(creator?: Address) {
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [transactions, setTransactions] = useState<TxRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rpc = createSolanaRpc(RPC_URL);

  const refresh = useCallback(async () => {
    if (!creator) return;
    setLoading(true);
    setError(null);

    try {
      const [vaultPda] = await deriveVaultPda(creator);

      // Fetch vault account
      const vaultAccount = await rpc
        .getAccountInfo(vaultPda, { encoding: "base64" })
        .send();

      if (!vaultAccount.value) {
        setVault(null);
        setTransactions([]);
        return;
      }

      const vaultData = Buffer.from(
        vaultAccount.value.data[0] as string,
        "base64"
      );
      const vaultInfo = deserialiseVault(vaultPda, vaultData);
      if (!vaultInfo) throw new Error("Failed to parse vault account");

      // Fetch vault SOL balance
      const balanceRes = await rpc.getBalance(vaultPda).send();
      vaultInfo.balanceLamports = BigInt(balanceRes.value);

      setVault(vaultInfo);

      // Fetch all transaction records
      const txRecords: TxRecord[] = [];
      for (let i = 0n; i < vaultInfo.txCount; i++) {
        try {
          const [txPda] = await deriveTxPda(vaultPda, i);
          const txAccount = await rpc
            .getAccountInfo(txPda, { encoding: "base64" })
            .send();
          if (!txAccount.value) continue;
          const txData = Buffer.from(
            txAccount.value.data[0] as string,
            "base64"
          );
          const record = deserialiseTransaction(txData);
          if (record) txRecords.push(record);
        } catch {
          // Missing or unparseable record — skip
        }
      }

      setTransactions(txRecords.reverse()); // newest first
    } catch (e) {
      setError(e instanceof Error ? e.message : "RPC error");
    } finally {
      setLoading(false);
    }
  }, [creator]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { vault, transactions, loading, error, refresh };
}

// ── Borsh deserialisers (manual, mirrors Rust structs) ────────────────────────

function deserialiseVault(pda: Address, data: Buffer): VaultInfo | null {
  try {
    let offset = 0;
    const discriminator = data.readUInt8(offset++);
    if (discriminator !== VAULT_DISCRIMINATOR) return null;

    // Vec<Pubkey> owners
    const ownerCount = data.readUInt32LE(offset);
    offset += 4;
    const owners: Address[] = [];
    for (let i = 0; i < ownerCount; i++) {
      owners.push(address(data.subarray(offset, offset + 32).toString("base58")));
      offset += 32;
    }

    const threshold = data.readUInt8(offset++);
    const txCount = data.readBigUInt64LE(offset);
    offset += 8;
    const bump = data.readUInt8(offset++);

    return {
      address: pda,
      balanceLamports: 0n, // populated after balance fetch
      owners,
      ownerCount: owners.length,
      threshold,
      txCount,
      bump,
    };
  } catch {
    return null;
  }
}

function deserialiseTransaction(data: Buffer): TxRecord | null {
  try {
    let offset = 0;
    const discriminator = data.readUInt8(offset++);
    if (discriminator !== TX_RECORD_DISCRIMINATOR) return null;

    // vault pubkey (32 bytes) — skip
    offset += 32;

    // to pubkey
    const to = address(data.subarray(offset, offset + 32).toString("base58"));
    offset += 32;

    // amount u64
    const amount = data.readBigUInt64LE(offset);
    offset += 8;

    // proposer pubkey (32 bytes)
    offset += 32;

    // memo string (4-byte LE length + bytes)
    const memoLen = data.readUInt32LE(offset);
    offset += 4;
    const memo = data.subarray(offset, offset + memoLen).toString("utf8");
    offset += memoLen;

    // approvals Vec<Pubkey>
    const approvalCount = data.readUInt32LE(offset);
    offset += 4;
    offset += approvalCount * 32;

    // rejections Vec<Pubkey>
    const rejectionCount = data.readUInt32LE(offset);
    offset += 4;
    offset += rejectionCount * 32;

    // status enum (1 byte)
    const status = data.readUInt8(offset++) as TxStatusValue;

    // tx_index u64
    const txIndex = data.readBigUInt64LE(offset);
    offset += 8;

    // created_at i64
    const createdAt = Number(data.readBigInt64LE(offset));
    offset += 8;

    // executed_at Option<i64>: 1-byte presence flag + optional 8 bytes
    const hasExecutedAt = data.readUInt8(offset++);
    const executedAt = hasExecutedAt ? Number(data.readBigInt64LE(offset)) : null;
    if (hasExecutedAt) offset += 8;

    return {
      txIndex,
      to,
      amount,
      proposer: "11111111111111111111111111111111" as Address, // already skipped
      memo,
      approvalCount,
      rejectionCount,
      status,
      createdAt,
      executedAt,
    };
  } catch {
    return null;
  }
}
