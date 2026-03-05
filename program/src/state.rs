use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

// ── Discriminators (first byte of every account) ────────────────────────────
pub const VAULT_DISCRIMINATOR: u8 = 1;
pub const TX_RECORD_DISCRIMINATOR: u8 = 2;

// ── Size constants ────────────────────────────────────────────────────────────
pub const MAX_OWNERS: usize = 10;
pub const MAX_MEMO_LEN: usize = 128;
/// Space for VaultState: discriminator(1) + owners(10*32) + threshold(1) +
/// owner_count(1) + tx_count(8) + bump(1) + padding(6) = 338 bytes
pub const VAULT_STATE_SIZE: usize = 338;

/// Space for TransactionRecord:
/// discriminator(1) + vault(32) + to(32) + amount(8) + proposer(32) +
/// memo(4+128) + approvals(10) + rejections(10) + status(1) + tx_index(8) +
/// created_at(8) + executed_at(9) + bump(1) = 284 bytes
pub const TX_RECORD_SIZE: usize = 284;

// ── Vault State ───────────────────────────────────────────────────────────────

/// On-chain state for a multi-sig treasury vault.
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct VaultState {
    /// Account type discriminator.
    pub discriminator: u8,
    /// Ordered list of owner pubkeys (up to MAX_OWNERS).
    pub owners: Vec<Pubkey>,
    /// Number of approvals required to execute a transaction.
    pub threshold: u8,
    /// Monotonically increasing transaction counter.
    pub tx_count: u64,
    /// PDA bump seed for this vault.
    pub bump: u8,
    /// Whether the vault is currently locked for governance changes.
    pub governance_locked: bool,
    
}

impl VaultState {
    pub fn new(owners: Vec<Pubkey>, threshold: u8, bump: u8) -> Self {
        Self {
            discriminator: VAULT_DISCRIMINATOR,
            owners,
            threshold,
            tx_count: 0,
            bump,
            governance_locked: false,
        }
    }

    /// Returns true if `key` is a registered owner.
    pub fn is_owner(&self, key: &Pubkey) -> bool {
        self.owners.contains(key)
    }

    /// Returns the owner count.
    pub fn owner_count(&self) -> usize {
        self.owners.len()
    }
}

// ── Transaction Status ────────────────────────────────────────────────────────

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum TxStatus {
    /// Awaiting more approvals.
    Pending,
    /// Threshold met — ready to execute.
    Approved,
    /// Executed on-chain.
    Executed,
    /// Cancelled by the proposer before execution.
    Cancelled,
    /// Rejected: majority of owners voted against.
    Rejected,
}

// ── Transaction Record ────────────────────────────────────────────────────────

/// On-chain record of a proposed treasury transaction.
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct TransactionRecord {
    /// Account type discriminator.
    pub discriminator: u8,
    /// The vault this transaction belongs to.
    pub vault: Pubkey,
    /// Destination account for the SOL transfer.
    pub to: Pubkey,
    /// Amount of lamports to transfer.
    pub amount: u64,
    /// The owner who proposed this transaction.
    pub proposer: Pubkey,
    /// Optional human-readable memo (max MAX_MEMO_LEN bytes).
    pub memo: String,
    /// Owners who have approved (ordered, no duplicates).
    pub approvals: Vec<Pubkey>, 
    /// Owners who have rejected (ordered, no duplicates).
    pub rejections: Vec<Pubkey>,
    /// Current lifecycle status.
    pub status: TxStatus,
    /// Index within the vault's transaction list.
    pub tx_index: u64,
    /// Unix timestamp of proposal creation (slot time approximation).
    pub created_at: i64,
    /// Unix timestamp of execution (None until executed).
    pub executed_at: Option<i64>,
    /// PDA bump seed.
    pub bump: u8,
}

impl TransactionRecord {
    pub fn new(
        vault: Pubkey,
        to: Pubkey,
        amount: u64,
        proposer: Pubkey,
        memo: String,
        tx_index: u64,
        created_at: i64,
        bump: u8,
    ) -> Self {
        Self {
            discriminator: TX_RECORD_DISCRIMINATOR,
            vault,
            to,
            amount,
            proposer,
            memo,
            approvals: vec![proposer], // proposer auto-approves
            rejections: vec![],
            status: TxStatus::Pending,
            tx_index,
            created_at,
            executed_at: None,
            bump,
        }
    }

    /// Returns true if `key` has already cast a vote.
    pub fn has_voted(&self, key: &Pubkey) -> bool {
        self.approvals.contains(key) || self.rejections.contains(key)
    }

    /// Number of approvals collected.
    pub fn approval_count(&self) -> usize {
        self.approvals.len()
    }

    /// Number of rejections collected.
    pub fn rejection_count(&self) -> usize {
        self.rejections.len()
    }
}
