import { address, type Address } from "@solana/kit";

// ── Program IDs ───────────────────────────────────────────────────────────────

/** Replace with your deployed program address after `anchor deploy` / `solana program deploy`. */
export const PROGRAM_ID: Address = address(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? "11111111111111111111111111111111"
);

// ── PDA Seeds ─────────────────────────────────────────────────────────────────

export const VAULT_SEED = "vault";
export const TX_SEED = "tx";

// ── Network ───────────────────────────────────────────────────────────────────

export const RPC_ENDPOINTS = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
} as const;

export type Network = keyof typeof RPC_ENDPOINTS;

// ── Account sizes (mirrors Rust constants) ────────────────────────────────────

export const VAULT_STATE_SIZE = 338;
export const TX_RECORD_SIZE = 284;
export const MAX_OWNERS = 10;
export const MAX_MEMO_LEN = 128;

// ── Instruction discriminators (Borsh enum variant indices) ──────────────────

export const IX = {
  InitVault: 0,
  ProposeTransaction: 1,
  ApproveTransaction: 2,
  RejectTransaction: 3,
  ExecuteTransaction: 4,
  CancelTransaction: 5,
  ChangeThreshold: 6,
  AddOwner: 7,
  RemoveOwner: 8,
} as const;

// ── Account discriminators ────────────────────────────────────────────────────

export const VAULT_DISCRIMINATOR = 1;
export const TX_RECORD_DISCRIMINATOR = 2;

// ── Transaction status (mirrors Rust TxStatus enum) ──────────────────────────

export const TxStatus = {
  Pending: 0,
  Approved: 1,
  Executed: 2,
  Cancelled: 3,
  Rejected: 4,
} as const;

export type TxStatusValue = (typeof TxStatus)[keyof typeof TxStatus];
