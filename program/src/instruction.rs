use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

/// All instructions supported by the sol-wallet multi-sig treasury program.
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum WalletInstruction {
    /// Initialize a new multi-sig treasury vault.
    ///
    /// Accounts:
    ///   0. `[signer, writable]` payer / vault creator
    ///   1. `[writable]`         vault state PDA
    ///   2. `[]`                 system program
    InitVault {
        /// Ordered list of co-signer pubkeys (2–10 members).
        owners: Vec<Pubkey>,
        /// Minimum signatures required to approve a transaction (1 ≤ threshold ≤ owners.len()).
        threshold: u8,
        /// Canonical bump for the vault PDA (supplied by client to avoid recomputation).
        bump: u8,
    },

    /// Propose a SOL transfer from the vault.
    ///
    /// Accounts:
    ///   0. `[signer, writable]` proposer (must be a vault owner)
    ///   1. `[writable]`         vault state PDA
    ///   2. `[writable]`         transaction record PDA
    ///   3. `[]`                 system program
    ProposeTransaction {
        /// Destination wallet to receive lamports.
        to: Pubkey,
        /// Amount in lamports.
        amount: u64,
        /// Memo / description (max 128 bytes).
        memo: String,
        /// Canonical bump for the transaction record PDA.
        tx_bump: u8,
    },

    /// Cast an approval vote on a pending transaction.
    ///
    /// Accounts:
    ///   0. `[signer]`   approver (must be a vault owner, not yet voted)
    ///   1. `[writable]` vault state PDA
    ///   2. `[writable]` transaction record PDA
    ApproveTransaction {
        /// Index of the transaction inside the vault's transaction list.
        tx_index: u64,
    },

    /// Cast a rejection vote on a pending transaction.
    ///
    /// Accounts:
    ///   0. `[signer]`   rejector (must be a vault owner, not yet voted)
    ///   1. `[writable]` vault state PDA
    ///   2. `[writable]` transaction record PDA
    RejectTransaction {
        tx_index: u64,
    },

    /// Execute a transaction once approval threshold is met.
    ///
    /// Accounts:
    ///   0. `[signer]`           executor (any vault owner)
    ///   1. `[writable]`         vault state PDA  (also the lamport source)
    ///   2. `[writable]`         transaction record PDA
    ///   3. `[writable]`         destination account
    ExecuteTransaction {
        tx_index: u64,
    },

    /// Cancel a pending transaction (only the original proposer may cancel).
    ///
    /// Accounts:
    ///   0. `[signer, writable]` original proposer
    ///   1. `[writable]`         vault state PDA
    ///   2. `[writable]`         transaction record PDA
    CancelTransaction {
        tx_index: u64,
    },

    /// Change the signing threshold (requires current threshold of approvals).
    ///
    /// Accounts:
    ///   0. `[signer]`   any vault owner initiating the governance change
    ///   1. `[writable]` vault state PDA
    ///   2. `[writable]` change proposal PDA
    ChangeThreshold {
        new_threshold: u8,
        change_bump: u8,
    },

    /// Add a new owner (requires current threshold of approvals).
    ///
    /// Accounts:
    ///   0. `[signer]`   any existing vault owner
    ///   1. `[writable]` vault state PDA
    AddOwner {
        new_owner: Pubkey,
    },

    /// Remove an existing owner (requires current threshold of approvals,
    /// threshold is auto-adjusted if it would exceed new owner count).
    ///
    /// Accounts:
    ///   0. `[signer]`   any existing vault owner (cannot remove themselves)
    ///   1. `[writable]` vault state PDA
    RemoveOwner {
        owner_to_remove: Pubkey,
    },
}
