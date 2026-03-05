use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};

use crate::{
    error::WalletError,
    instruction::WalletInstruction,
    require, require_keys_eq, require_signer,
    security::{
        assert_no_duplicate_owners, assert_owned_by, assert_sufficient_funds,
        assert_tx_pda, assert_vault_pda,
    },
    state::{
        TransactionRecord, TxStatus, VaultState, MAX_MEMO_LEN, MAX_OWNERS,
        TX_RECORD_SIZE, VAULT_STATE_SIZE,
    },
};

pub struct Processor;

impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = WalletInstruction::try_from_slice(instruction_data)
            .map_err(|_| WalletError::DeserializationError)?;

        match instruction {
            WalletInstruction::InitVault { owners, threshold, bump } => {
                Self::process_init_vault(program_id, accounts, owners, threshold, bump)
            }
            WalletInstruction::ProposeTransaction { to, amount, memo, tx_bump } => {
                Self::process_propose_transaction(program_id, accounts, to, amount, memo, tx_bump)
            }
            WalletInstruction::ApproveTransaction { tx_index } => {
                Self::process_approve_transaction(program_id, accounts, tx_index)
            }
            WalletInstruction::RejectTransaction { tx_index } => {
                Self::process_reject_transaction(program_id, accounts, tx_index)
            }
            WalletInstruction::ExecuteTransaction { tx_index } => {
                Self::process_execute_transaction(program_id, accounts, tx_index)
            }
            WalletInstruction::CancelTransaction { tx_index } => {
                Self::process_cancel_transaction(program_id, accounts, tx_index)
            }
            WalletInstruction::ChangeThreshold { new_threshold, change_bump: _ } => {
                Self::process_change_threshold(program_id, accounts, new_threshold)
            }
            WalletInstruction::AddOwner { new_owner } => {
                Self::process_add_owner(program_id, accounts, new_owner)
            }
            WalletInstruction::RemoveOwner { owner_to_remove } => {
                Self::process_remove_owner(program_id, accounts, owner_to_remove)
            }
        }
    }

    // ── InitVault ─────────────────────────────────────────────────────────────

    fn process_init_vault(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        owners: Vec<Pubkey>,
        threshold: u8,
        bump: u8,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let payer = next_account_info(account_info_iter)?;
        let vault_account = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        require_signer!(payer);

        // Validate owners list
        require!(!owners.is_empty(), WalletError::NoOwners);
        require!(owners.len() <= MAX_OWNERS, WalletError::TooManyOwners);
        require!(threshold >= 1, WalletError::ThresholdTooLow);
        require!(threshold as usize <= owners.len(), WalletError::ThresholdTooHigh);
        assert_no_duplicate_owners(&owners)?;

        // Verify PDA
        assert_vault_pda(program_id, payer.key, bump, vault_account)?;

        // Allocate vault account
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(VAULT_STATE_SIZE);
        let signer_seeds: &[&[u8]] = &[b"vault", payer.key.as_ref(), &[bump]];

        invoke_signed(
            &system_instruction::create_account(
                payer.key,
                vault_account.key,
                lamports,
                VAULT_STATE_SIZE as u64,
                program_id,
            ),
            &[payer.clone(), vault_account.clone(), system_program.clone()],
            &[signer_seeds],
        )?;

        // Serialise initial state
        let vault_state = VaultState::new(owners, threshold, bump);
        vault_state.serialize(&mut &mut vault_account.data.borrow_mut()[..])?;

        Ok(())
    }

    // ── ProposeTransaction ────────────────────────────────────────────────────

    fn process_propose_transaction(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        to: Pubkey,
        amount: u64,
        memo: String,
        tx_bump: u8,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let proposer = next_account_info(account_info_iter)?;
        let vault_account = next_account_info(account_info_iter)?;
        let tx_account = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        require_signer!(proposer);
        assert_owned_by(vault_account, program_id)?;

        require!(memo.len() <= MAX_MEMO_LEN, WalletError::MemoTooLong);

        let mut vault_state = VaultState::try_from_slice(&vault_account.data.borrow())
            .map_err(|_| WalletError::DeserializationError)?;

        require!(vault_state.is_owner(proposer.key), WalletError::NotAnOwner);
        require!(!vault_state.governance_locked, WalletError::VaultLocked);

        let tx_index = vault_state.tx_count;

        // Verify tx PDA
        assert_tx_pda(program_id, vault_account.key, tx_index, tx_bump, tx_account)?;

        // Allocate transaction record account
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(TX_RECORD_SIZE);
        let idx_bytes = tx_index.to_le_bytes();
        let signer_seeds: &[&[u8]] = &[b"tx", vault_account.key.as_ref(), &idx_bytes, &[tx_bump]];

        invoke_signed(
            &system_instruction::create_account(
                proposer.key,
                tx_account.key,
                lamports,
                TX_RECORD_SIZE as u64,
                program_id,
            ),
            &[proposer.clone(), tx_account.clone(), system_program.clone()],
            &[signer_seeds],
        )?;

        let clock = Clock::get()?;
        let tx_record = TransactionRecord::new(
            *vault_account.key,
            to,
            amount,
            *proposer.key,
            memo,
            tx_index,
            clock.unix_timestamp,
            tx_bump,
        );

        tx_record.serialize(&mut &mut tx_account.data.borrow_mut()[..])?;

        // Increment vault tx counter
        vault_state.tx_count = vault_state
            .tx_count
            .checked_add(1)
            .ok_or(WalletError::ArithmeticOverflow)?;
        vault_state.serialize(&mut &mut vault_account.data.borrow_mut()[..])?;

        Ok(())
    }

    // ── ApproveTransaction ────────────────────────────────────────────────────

    fn process_approve_transaction(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        tx_index: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let approver = next_account_info(account_info_iter)?;
        let vault_account = next_account_info(account_info_iter)?;
        let tx_account = next_account_info(account_info_iter)?;

        require_signer!(approver);
        assert_owned_by(vault_account, program_id)?;
        assert_owned_by(tx_account, program_id)?;

        let vault_state = VaultState::try_from_slice(&vault_account.data.borrow())
            .map_err(|_| WalletError::DeserializationError)?;

        require!(vault_state.is_owner(approver.key), WalletError::NotAnOwner);

        let mut tx_record = TransactionRecord::try_from_slice(&tx_account.data.borrow())
            .map_err(|_| WalletError::DeserializationError)?;

        require_keys_eq!(tx_record.vault, *vault_account.key, WalletError::TransactionVaultMismatch);
        require!(tx_record.tx_index == tx_index, WalletError::TransactionIndexMismatch);
        require!(tx_record.status == TxStatus::Pending, WalletError::TransactionNotPending);
        require!(!tx_record.has_voted(approver.key), WalletError::AlreadyVoted);

        tx_record.approvals.push(*approver.key);

        // Auto-advance status when threshold is met
        if tx_record.approval_count() >= vault_state.threshold as usize {
            tx_record.status = TxStatus::Approved;
        }

        tx_record.serialize(&mut &mut tx_account.data.borrow_mut()[..])?;

        Ok(())
    }

    // ── RejectTransaction ─────────────────────────────────────────────────────

    fn process_reject_transaction(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        tx_index: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let rejector = next_account_info(account_info_iter)?;
        let vault_account = next_account_info(account_info_iter)?;
        let tx_account = next_account_info(account_info_iter)?;

        require_signer!(rejector);
        assert_owned_by(vault_account, program_id)?;
        assert_owned_by(tx_account, program_id)?;

        let vault_state = VaultState::try_from_slice(&vault_account.data.borrow())
            .map_err(|_| WalletError::DeserializationError)?;

        require!(vault_state.is_owner(rejector.key), WalletError::NotAnOwner);

        let mut tx_record = TransactionRecord::try_from_slice(&tx_account.data.borrow())
            .map_err(|_| WalletError::DeserializationError)?;

        require_keys_eq!(tx_record.vault, *vault_account.key, WalletError::TransactionVaultMismatch);
        require!(tx_record.tx_index == tx_index, WalletError::TransactionIndexMismatch);
        require!(tx_record.status == TxStatus::Pending, WalletError::TransactionNotPending);
        require!(!tx_record.has_voted(rejector.key), WalletError::AlreadyVoted);

        tx_record.rejections.push(*rejector.key);

        // If majority have rejected, mark as Rejected
        let owners_remaining = vault_state.owner_count()
            .checked_sub(tx_record.rejection_count())
            .unwrap_or(0);
        if owners_remaining < vault_state.threshold as usize {
            tx_record.status = TxStatus::Rejected;
        }

        tx_record.serialize(&mut &mut tx_account.data.borrow_mut()[..])?;

        Ok(())
    }

    // ── ExecuteTransaction ────────────────────────────────────────────────────

    fn process_execute_transaction(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        tx_index: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let executor = next_account_info(account_info_iter)?;
        let vault_account = next_account_info(account_info_iter)?;
        let tx_account = next_account_info(account_info_iter)?;
        let destination = next_account_info(account_info_iter)?;

        require_signer!(executor);
        assert_owned_by(vault_account, program_id)?;
        assert_owned_by(tx_account, program_id)?;

        let vault_state = VaultState::try_from_slice(&vault_account.data.borrow())
            .map_err(|_| WalletError::DeserializationError)?;

        require!(vault_state.is_owner(executor.key), WalletError::NotAnOwner);

        let mut tx_record = TransactionRecord::try_from_slice(&tx_account.data.borrow())
            .map_err(|_| WalletError::DeserializationError)?;

        require_keys_eq!(tx_record.vault, *vault_account.key, WalletError::TransactionVaultMismatch);
        require!(tx_record.tx_index == tx_index, WalletError::TransactionIndexMismatch);
        require!(tx_record.status == TxStatus::Approved, WalletError::TransactionNotApproved);
        require_keys_eq!(*destination.key, tx_record.to, WalletError::DestinationMismatch);

        // Check vault has enough lamports (above rent-exempt minimum)
        let rent = Rent::get()?;
        let min_balance = rent.minimum_balance(VAULT_STATE_SIZE);
        assert_sufficient_funds(**vault_account.lamports.borrow(), min_balance, tx_record.amount)?;

        // Transfer lamports using PDA signer
        let signer_seeds: &[&[u8]] = &[b"vault", executor.key.as_ref(), &[vault_state.bump]];
        invoke_signed(
            &system_instruction::transfer(vault_account.key, destination.key, tx_record.amount),
            &[vault_account.clone(), destination.clone()],
            &[signer_seeds],
        )?;

        let clock = Clock::get()?;
        tx_record.status = TxStatus::Executed;
        tx_record.executed_at = Some(clock.unix_timestamp);
        tx_record.serialize(&mut &mut tx_account.data.borrow_mut()[..])?;

        Ok(())
    }

    // ── CancelTransaction ─────────────────────────────────────────────────────

    fn process_cancel_transaction(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        tx_index: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let proposer = next_account_info(account_info_iter)?;
        let vault_account = next_account_info(account_info_iter)?;
        let tx_account = next_account_info(account_info_iter)?;

        require_signer!(proposer);
        assert_owned_by(vault_account, program_id)?;
        assert_owned_by(tx_account, program_id)?;

        let mut tx_record = TransactionRecord::try_from_slice(&tx_account.data.borrow())
            .map_err(|_| WalletError::DeserializationError)?;

        require_keys_eq!(tx_record.vault, *vault_account.key, WalletError::TransactionVaultMismatch);
        require!(tx_record.tx_index == tx_index, WalletError::TransactionIndexMismatch);
        require_keys_eq!(tx_record.proposer, *proposer.key, WalletError::NotProposer);
        require!(
            tx_record.status == TxStatus::Pending || tx_record.status == TxStatus::Approved,
            WalletError::AlreadyExecuted
        );

        tx_record.status = TxStatus::Cancelled;
        tx_record.serialize(&mut &mut tx_account.data.borrow_mut()[..])?;

        Ok(())
    }

    // ── ChangeThreshold ───────────────────────────────────────────────────────

    fn process_change_threshold(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        new_threshold: u8,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let signer = next_account_info(account_info_iter)?;
        let vault_account = next_account_info(account_info_iter)?;

        require_signer!(signer);
        assert_owned_by(vault_account, program_id)?;

        let mut vault_state = VaultState::try_from_slice(&vault_account.data.borrow())
            .map_err(|_| WalletError::DeserializationError)?;

        require!(vault_state.is_owner(signer.key), WalletError::NotAnOwner);
        require!(new_threshold >= 1, WalletError::ThresholdTooLow);
        require!(
            new_threshold as usize <= vault_state.owner_count(),
            WalletError::ThresholdTooHigh
        );

        vault_state.threshold = new_threshold;
        vault_state.serialize(&mut &mut vault_account.data.borrow_mut()[..])?;

        Ok(())
    }

    // ── AddOwner ──────────────────────────────────────────────────────────────

    fn process_add_owner(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        new_owner: Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let signer = next_account_info(account_info_iter)?;
        let vault_account = next_account_info(account_info_iter)?;

        require_signer!(signer);
        assert_owned_by(vault_account, program_id)?;

        let mut vault_state = VaultState::try_from_slice(&vault_account.data.borrow())
            .map_err(|_| WalletError::DeserializationError)?;

        require!(vault_state.is_owner(signer.key), WalletError::NotAnOwner);
        require!(vault_state.owner_count() < MAX_OWNERS, WalletError::MaxOwnersReached);
        require!(!vault_state.is_owner(&new_owner), WalletError::OwnerAlreadyExists);

        vault_state.owners.push(new_owner);
        vault_state.serialize(&mut &mut vault_account.data.borrow_mut()[..])?;

        Ok(())
    }

    // ── RemoveOwner ───────────────────────────────────────────────────────────

    fn process_remove_owner(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        owner_to_remove: Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let signer = next_account_info(account_info_iter)?;
        let vault_account = next_account_info(account_info_iter)?;

        require_signer!(signer);
        assert_owned_by(vault_account, program_id)?;

        let mut vault_state = VaultState::try_from_slice(&vault_account.data.borrow())
            .map_err(|_| WalletError::DeserializationError)?;

        require!(vault_state.is_owner(signer.key), WalletError::NotAnOwner);
        require_keys_eq!(owner_to_remove, *signer.key == owner_to_remove, WalletError::CannotRemoveSelf);
        require!(vault_state.is_owner(&owner_to_remove), WalletError::OwnerNotFound);

        vault_state.owners.retain(|o| o != &owner_to_remove);

        // Auto-clamp threshold if needed
        if vault_state.threshold as usize > vault_state.owner_count() {
            vault_state.threshold = vault_state.owner_count() as u8;
        }

        vault_state.serialize(&mut &mut vault_account.data.borrow_mut()[..])?;

        Ok(())
    }
}





