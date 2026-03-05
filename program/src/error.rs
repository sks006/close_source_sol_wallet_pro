use solana_program::program_error::ProgramError;
use thiserror::Error;

#[derive(Error, Debug, Copy, Clone, PartialEq)]
pub enum WalletError {
    // ── Initialisation ───────────────────────────────────────────────────────
    #[error("Owner list is empty")]
    NoOwners,

    #[error("Too many owners — maximum is 10")]
    TooManyOwners,

    #[error("Threshold must be at least 1")]
    ThresholdTooLow,

    #[error("Threshold exceeds the number of owners")]
    ThresholdTooHigh,

    #[error("Duplicate owner pubkey detected")]
    DuplicateOwner,

    // ── Access control ────────────────────────────────────────────────────────
    #[error("Signer is not a registered vault owner")]
    NotAnOwner,

    #[error("Signer is not the original proposer of this transaction")]
    NotProposer,

    // ── Transaction lifecycle ─────────────────────────────────────────────────
    #[error("Transaction is not in Pending status")]
    TransactionNotPending,

    #[error("Transaction is not in Approved status")]
    TransactionNotApproved,

    #[error("Transaction has already been executed")]
    AlreadyExecuted,

    #[error("Transaction has been cancelled")]
    AlreadyCancelled,

    #[error("Transaction has been rejected")]
    AlreadyRejected,

    #[error("This owner has already voted on this transaction")]
    AlreadyVoted,

    #[error("Approval threshold has not been reached yet")]
    ThresholdNotMet,

    // ── Vault constraints ─────────────────────────────────────────────────────
    #[error("Vault does not have enough lamports for this transfer")]
    InsufficientFunds,

    #[error("Vault is locked while a governance change is in progress")]
    VaultLocked,

    #[error("Cannot remove yourself as an owner")]
    CannotRemoveSelf,

    #[error("Owner to remove is not in the vault")]
    OwnerNotFound,

    #[error("Owner already exists in this vault")]
    OwnerAlreadyExists,

    #[error("Vault already has the maximum number of owners (10)")]
    MaxOwnersReached,

    // ── Account validation ────────────────────────────────────────────────────
    #[error("Account discriminator mismatch — wrong account type")]
    InvalidAccountDiscriminator,

    #[error("Transaction does not belong to this vault")]
    TransactionVaultMismatch,

    #[error("Provided transaction index does not match the record")]
    TransactionIndexMismatch,

    #[error("Destination account in instruction does not match the record")]
    DestinationMismatch,

    // ── Serialisation ─────────────────────────────────────────────────────────
    #[error("Failed to deserialise account data")]
    DeserializationError,

    #[error("Memo exceeds 128 bytes")]
    MemoTooLong,

    // ── Arithmetic ────────────────────────────────────────────────────────────
    #[error("Arithmetic overflow")]
    ArithmeticOverflow,
}

impl From<WalletError> for ProgramError {
    fn from(e: WalletError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
