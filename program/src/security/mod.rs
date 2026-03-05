use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
    pubkey::Pubkey,
};
use crate::error::WalletError;

// ── Guard Macros ─────────────────────────────────────────────────────────────

/// Assert that an account is a signer; return NotAnOwner otherwise.
#[macro_export]
macro_rules! require_signer {
    ($account:expr) => {
        if !$account.is_signer {
            return Err(crate::error::WalletError::NotAnOwner.into());
        }
    };
}

/// Assert a boolean condition; return a specific WalletError if false.
#[macro_export]
macro_rules! require {
    ($cond:expr, $err:expr) => {
        if !($cond) {
            return Err($err.into());
        }
    };
}

/// Assert that two pubkeys are equal; return a specific WalletError if not.
#[macro_export]
macro_rules! require_keys_eq {
    ($a:expr, $b:expr, $err:expr) => {
        if $a != $b {
            return Err($err.into());
        }
    };
}

// ── PDA Derivation Helpers ────────────────────────────────────────────────────

/// Seeds for the vault PDA: `[b"vault", creator_pubkey]`
pub fn vault_seeds<'a>(creator: &'a Pubkey) -> Vec<Vec<u8>> {
    vec![b"vault".to_vec(), creator.to_bytes().to_vec()]
}

/// Seeds for a transaction record PDA: `[b"tx", vault_pubkey, tx_index_le_bytes]`
pub fn tx_record_seeds(vault: &Pubkey, tx_index: u64) -> Vec<Vec<u8>> {
    vec![
        b"tx".to_vec(),
        vault.to_bytes().to_vec(),
        tx_index.to_le_bytes().to_vec(),
    ]
}

/// Derive a vault PDA address and verify it matches the provided account.
pub fn assert_vault_pda(
    program_id: &Pubkey,
    creator: &Pubkey,
    expected_bump: u8,
    account: &AccountInfo,
) -> Result<(), ProgramError> {
    let seeds: Vec<&[u8]> = vec![b"vault", creator.as_ref()];
    let (derived, bump) = Pubkey::find_program_address(&seeds, program_id);
    if bump != expected_bump || derived != *account.key {
        return Err(ProgramError::InvalidSeeds);
    }
    Ok(())
}

/// Derive a transaction record PDA and verify it matches the provided account.
pub fn assert_tx_pda(
    program_id: &Pubkey,
    vault: &Pubkey,
    tx_index: u64,
    expected_bump: u8,
    account: &AccountInfo,
) -> Result<(), ProgramError> {
    let idx_bytes = tx_index.to_le_bytes();
    let seeds: Vec<&[u8]> = vec![b"tx", vault.as_ref(), &idx_bytes];
    let (derived, bump) = Pubkey::find_program_address(&seeds, program_id);
    if bump != expected_bump || derived != *account.key {
        return Err(ProgramError::InvalidSeeds);
    }
    Ok(())
}

// ── Account Ownership Guard ───────────────────────────────────────────────────

/// Assert that an account is owned by this program.
pub fn assert_owned_by(account: &AccountInfo, program_id: &Pubkey) -> Result<(), ProgramError> {
    if account.owner != program_id {
        return Err(ProgramError::IllegalOwner);
    }
    Ok(())
}

// ── Lamport Guard ─────────────────────────────────────────────────────────────

/// Assert the vault has at least `amount` lamports above the rent-exempt minimum.
pub fn assert_sufficient_funds(
    vault_lamports: u64,
    rent_exempt_minimum: u64,
    amount: u64,
) -> Result<(), ProgramError> {
    let available = vault_lamports
        .checked_sub(rent_exempt_minimum)
        .ok_or(WalletError::InsufficientFunds)?;
    if available < amount {
        return Err(WalletError::InsufficientFunds.into());
    }
    Ok(())
}

// ── Duplicate-Owner Guard ─────────────────────────────────────────────────────

/// Assert no duplicate pubkeys in an owner slice.
pub fn assert_no_duplicate_owners(owners: &[Pubkey]) -> Result<(), ProgramError> {
    for i in 0..owners.len() {
        for j in (i + 1)..owners.len() {
            if owners[i] == owners[j] {
                return Err(WalletError::DuplicateOwner.into());
            }
        }
    }
    Ok(())
}
