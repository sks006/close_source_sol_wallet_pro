import {
  address,
  type Address,
  getProgramDerivedAddress,
  getAddressEncoder,
} from "@solana/kit";
import { PROGRAM_ID, VAULT_SEED, TX_SEED, TxStatus, type TxStatusValue } from "./constants";

// ── PDA derivation ────────────────────────────────────────────────────────────

/**
 * Derive the vault PDA for a given creator address.
 * Seeds: [b"vault", creator_bytes]
 */
export async function deriveVaultPda(
  creator: Address
): Promise<readonly [Address, number]> {
  const creatorBytes = getAddressEncoder().encode(creator);
  return getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [new TextEncoder().encode(VAULT_SEED), creatorBytes],
  });
}

/**
 * Derive the transaction record PDA.
 * Seeds: [b"tx", vault_bytes, tx_index_le_bytes]
 */
export async function deriveTxPda(
  vault: Address,
  txIndex: bigint
): Promise<readonly [Address, number]> {
  const vaultBytes = getAddressEncoder().encode(vault);
  const idxBytes = new Uint8Array(8);
  new DataView(idxBytes.buffer).setBigUint64(0, txIndex, true); // little-endian
  return getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [new TextEncoder().encode(TX_SEED), vaultBytes, idxBytes],
  });
}

// ── Borsh helpers ─────────────────────────────────────────────────────────────

/** Write a u8 into a DataView at `offset` and advance. */
export function writeU8(view: DataView, offset: number, value: number): number {
  view.setUint8(offset, value);
  return offset + 1;
}

/** Write a u64 (as bigint, LE) into a DataView at `offset` and advance. */
export function writeU64(
  view: DataView,
  offset: number,
  value: bigint
): number {
  view.setBigUint64(offset, value, true);
  return offset + 8;
}

/** Write a Solana public key (32 bytes) at `offset`. */
export function writePubkey(
  buffer: Uint8Array,
  offset: number,
  addr: Address
): number {
  const bytes = getAddressEncoder().encode(addr);
  buffer.set(bytes, offset);
  return offset + 32;
}

/** Write a Borsh-serialised string (4-byte LE length prefix + UTF-8 bytes). */
export function writeString(
  buffer: Uint8Array,
  offset: number,
  str: string
): number {
  const encoded = new TextEncoder().encode(str);
  const view = new DataView(buffer.buffer);
  view.setUint32(offset, encoded.length, true);
  buffer.set(encoded, offset + 4);
  return offset + 4 + encoded.length;
}

/** Write a Borsh Vec<Pubkey> (4-byte LE length + 32 bytes × n). */
export function writePubkeyVec(
  buffer: Uint8Array,
  offset: number,
  addrs: Address[]
): number {
  const view = new DataView(buffer.buffer);
  view.setUint32(offset, addrs.length, true);
  offset += 4;
  for (const addr of addrs) {
    offset = writePubkey(buffer, offset, addr);
  }
  return offset;
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** Human-readable label for a TxStatus value. */
export function txStatusLabel(status: TxStatusValue): string {
  return (
    (
      Object.entries(TxStatus) as Array<[string, TxStatusValue]>
    ).find(([, v]) => v === status)?.[0] ?? "Unknown"
  );
}

/** Format lamports as a SOL string with 9 decimal places. */
export function lamportsToSol(lamports: bigint): string {
  const sol = Number(lamports) / 1e9;
  return sol.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 9,
  });
}

/** Parse a SOL string into lamports as bigint. */
export function solToLamports(sol: string): bigint {
  const value = parseFloat(sol);
  if (isNaN(value) || value < 0) throw new Error("Invalid SOL amount");
  return BigInt(Math.round(value * 1e9));
}

/** Shorten an address for display: Abc1...xyz9 */
export function shortenAddress(addr: Address, chars = 4): string {
  const s = addr.toString();
  return `${s.slice(0, chars)}...${s.slice(-chars)}`;
}

/** Validate that a string is a valid Solana base58 address. */
export function isValidAddress(str: string): boolean {
  try {
    address(str);
    return true;
  } catch {
    return false;
  }
}
