import {
  type Address,
  type IInstruction,
  AccountRole,
  getAddressEncoder,
} from "@solana/kit";
import { PROGRAM_ID, IX, MAX_MEMO_LEN } from "./constants";
import {
  writeU8,
  writeU64,
  writePubkey,
  writePubkeyVec,
  writeString,
  deriveVaultPda,
  deriveTxPda,
} from "./utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InitVaultParams {
  payer: Address;
  owners: Address[];
  threshold: number;
}

export interface ProposeTransactionParams {
  proposer: Address;
  vault: Address;
  to: Address;
  amount: bigint;
  memo?: string;
  txIndex: bigint;
}

export interface VoteTxParams {
  voter: Address;
  vault: Address;
  txPda: Address;
  txIndex: bigint;
}

export interface ExecuteTxParams {
  executor: Address;
  vault: Address;
  txPda: Address;
  destination: Address;
  txIndex: bigint;
}

export interface CancelTxParams {
  proposer: Address;
  vault: Address;
  txPda: Address;
  txIndex: bigint;
}

// ── Instruction builders ──────────────────────────────────────────────────────

/**
 * Build an InitVault instruction.
 * Creates the vault PDA and writes the initial multi-sig configuration.
 */
export async function buildInitVaultIx(
  params: InitVaultParams
): Promise<IInstruction> {
  const { payer, owners, threshold } = params;
  const [vaultPda, bump] = await deriveVaultPda(payer);

  // Layout: variant(1) + owners_vec(4 + 32*n) + threshold(1) + bump(1)
  const dataSize = 1 + 4 + 32 * owners.length + 1 + 1;
  const buffer = new Uint8Array(dataSize);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  offset = writeU8(view, offset, IX.InitVault);
  offset = writePubkeyVec(buffer, offset, owners);
  offset = writeU8(view, offset, threshold);
  offset = writeU8(view, offset, bump);

  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: payer, role: AccountRole.WRITABLE_SIGNER },
      { address: vaultPda, role: AccountRole.WRITABLE },
      { address: "11111111111111111111111111111111" as Address, role: AccountRole.READONLY },
    ],
    data: buffer,
  };
}

/**
 * Build a ProposeTransaction instruction.
 * Allocates a new transaction record PDA and records the proposed transfer.
 */
export async function buildProposeTransactionIx(
  params: ProposeTransactionParams
): Promise<IInstruction> {
  const { proposer, vault, to, amount, memo = "", txIndex } = params;
  if (memo.length > MAX_MEMO_LEN) {
    throw new Error(`Memo exceeds ${MAX_MEMO_LEN} bytes`);
  }
  const [txPda, txBump] = await deriveTxPda(vault, txIndex);

  const memoBytes = new TextEncoder().encode(memo);
  const dataSize = 1 + 32 + 8 + 4 + memoBytes.length + 1;
  const buffer = new Uint8Array(dataSize);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  offset = writeU8(view, offset, IX.ProposeTransaction);
  offset = writePubkey(buffer, offset, to);
  offset = writeU64(view, offset, amount);
  offset = writeString(buffer, offset, memo);
  offset = writeU8(view, offset, txBump);

  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: proposer, role: AccountRole.WRITABLE_SIGNER },
      { address: vault, role: AccountRole.WRITABLE },
      { address: txPda, role: AccountRole.WRITABLE },
      { address: "11111111111111111111111111111111" as Address, role: AccountRole.READONLY },
    ],
    data: buffer,
  };
}

/**
 * Build an ApproveTransaction instruction.
 */
export function buildApproveTransactionIx(params: VoteTxParams): IInstruction {
  const { voter, vault, txPda, txIndex } = params;
  const buffer = new Uint8Array(9);
  const view = new DataView(buffer.buffer);
  writeU8(view, 0, IX.ApproveTransaction);
  writeU64(view, 1, txIndex);

  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: voter, role: AccountRole.READONLY_SIGNER },
      { address: vault, role: AccountRole.WRITABLE },
      { address: txPda, role: AccountRole.WRITABLE },
    ],
    data: buffer,
  };
}

/**
 * Build a RejectTransaction instruction.
 */
export function buildRejectTransactionIx(params: VoteTxParams): IInstruction {
  const { voter, vault, txPda, txIndex } = params;
  const buffer = new Uint8Array(9);
  const view = new DataView(buffer.buffer);
  writeU8(view, 0, IX.RejectTransaction);
  writeU64(view, 1, txIndex);

  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: voter, role: AccountRole.READONLY_SIGNER },
      { address: vault, role: AccountRole.WRITABLE },
      { address: txPda, role: AccountRole.WRITABLE },
    ],
    data: buffer,
  };
}

/**
 * Build an ExecuteTransaction instruction.
 */
export function buildExecuteTransactionIx(
  params: ExecuteTxParams
): IInstruction {
  const { executor, vault, txPda, destination, txIndex } = params;
  const buffer = new Uint8Array(9);
  const view = new DataView(buffer.buffer);
  writeU8(view, 0, IX.ExecuteTransaction);
  writeU64(view, 1, txIndex);

  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: executor, role: AccountRole.READONLY_SIGNER },
      { address: vault, role: AccountRole.WRITABLE },
      { address: txPda, role: AccountRole.WRITABLE },
      { address: destination, role: AccountRole.WRITABLE },
    ],
    data: buffer,
  };
}

/**
 * Build a CancelTransaction instruction.
 */
export function buildCancelTransactionIx(
  params: CancelTxParams
): IInstruction {
  const { proposer, vault, txPda, txIndex } = params;
  const buffer = new Uint8Array(9);
  const view = new DataView(buffer.buffer);
  writeU8(view, 0, IX.CancelTransaction);
  writeU64(view, 1, txIndex);

  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: proposer, role: AccountRole.WRITABLE_SIGNER },
      { address: vault, role: AccountRole.WRITABLE },
      { address: txPda, role: AccountRole.WRITABLE },
    ],
    data: buffer,
  };
}

/**
 * Build a ChangeThreshold instruction.
 */
export function buildChangeThresholdIx(
  signer: Address,
  vault: Address,
  newThreshold: number
): IInstruction {
  const buffer = new Uint8Array(3);
  const view = new DataView(buffer.buffer);
  writeU8(view, 0, IX.ChangeThreshold);
  writeU8(view, 1, newThreshold);
  writeU8(view, 2, 0); // change_bump placeholder

  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: signer, role: AccountRole.READONLY_SIGNER },
      { address: vault, role: AccountRole.WRITABLE },
    ],
    data: buffer,
  };
}

/**
 * Build an AddOwner instruction.
 */
export function buildAddOwnerIx(
  signer: Address,
  vault: Address,
  newOwner: Address
): IInstruction {
  const buffer = new Uint8Array(33);
  const view = new DataView(buffer.buffer);
  writeU8(view, 0, IX.AddOwner);
  writePubkey(buffer, 1, newOwner);

  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: signer, role: AccountRole.READONLY_SIGNER },
      { address: vault, role: AccountRole.WRITABLE },
    ],
    data: buffer,
  };
}

/**
 * Build a RemoveOwner instruction.
 */
export function buildRemoveOwnerIx(
  signer: Address,
  vault: Address,
  ownerToRemove: Address
): IInstruction {
  const buffer = new Uint8Array(33);
  const view = new DataView(buffer.buffer);
  writeU8(view, 0, IX.RemoveOwner);
  writePubkey(buffer, 1, ownerToRemove);

  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: signer, role: AccountRole.READONLY_SIGNER },
      { address: vault, role: AccountRole.WRITABLE },
    ],
    data: buffer,
  };
}
