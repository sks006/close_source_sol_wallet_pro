use borsh::BorshSerialize;
use litesvm::LiteSvm;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_program,
    transaction::Transaction,
};
use sol_wallet::instruction::WalletInstruction;
use sol_wallet::state::{TransactionRecord, TxStatus, VaultState};

// ── Test helpers ──────────────────────────────────────────────────────────────

fn program_id() -> Pubkey {
    // Replace with your deployed program ID when testing on devnet.
    Pubkey::new_unique()
}

fn derive_vault_pda(program_id: &Pubkey, creator: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"vault", creator.as_ref()], program_id)
}

fn derive_tx_pda(program_id: &Pubkey, vault: &Pubkey, tx_index: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"tx", vault.as_ref(), &tx_index.to_le_bytes()],
        program_id,
    )
}

fn build_init_vault_ix(
    program_id: Pubkey,
    payer: &Keypair,
    vault_pda: Pubkey,
    owners: Vec<Pubkey>,
    threshold: u8,
    bump: u8,
) -> Instruction {
    let data = WalletInstruction::InitVault { owners, threshold, bump }
        .try_to_vec()
        .unwrap();
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(vault_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data,
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[test]
fn test_init_vault_success() {
    let mut svm = LiteSvm::new();
    let pid = program_id();
    svm.add_program(pid, include_bytes!("../../target/deploy/sol_wallet.so"));

    let creator = Keypair::new();
    let owner2 = Keypair::new();
    svm.airdrop(&creator.pubkey(), 10_000_000_000).unwrap();

    let owners = vec![creator.pubkey(), owner2.pubkey()];
    let (vault_pda, bump) = derive_vault_pda(&pid, &creator.pubkey());

    let ix = build_init_vault_ix(pid, &creator, vault_pda, owners.clone(), 2, bump);
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&creator.pubkey()),
        &[&creator],
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx).expect("InitVault should succeed");

    let account = svm.get_account(&vault_pda).expect("Vault account should exist");
    let state = VaultState::try_from_slice(&account.data).unwrap();
    assert_eq!(state.owners, owners);
    assert_eq!(state.threshold, 2);
    assert_eq!(state.tx_count, 0);
}

#[test]
fn test_init_vault_duplicate_owner_fails() {
    let mut svm = LiteSvm::new();
    let pid = program_id();
    svm.add_program(pid, include_bytes!("../../target/deploy/sol_wallet.so"));

    let creator = Keypair::new();
    svm.airdrop(&creator.pubkey(), 10_000_000_000).unwrap();

    let owners = vec![creator.pubkey(), creator.pubkey()]; // duplicate!
    let (vault_pda, bump) = derive_vault_pda(&pid, &creator.pubkey());

    let ix = build_init_vault_ix(pid, &creator, vault_pda, owners, 1, bump);
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&creator.pubkey()),
        &[&creator],
        svm.latest_blockhash(),
    );

    assert!(svm.send_transaction(tx).is_err(), "Duplicate owners should be rejected");
}

#[test]
fn test_propose_and_approve_transaction() {
    let mut svm = LiteSvm::new();
    let pid = program_id();
    svm.add_program(pid, include_bytes!("../../target/deploy/sol_wallet.so"));

    let owner1 = Keypair::new();
    let owner2 = Keypair::new();
    let recipient = Keypair::new();
    svm.airdrop(&owner1.pubkey(), 10_000_000_000).unwrap();
    svm.airdrop(&owner2.pubkey(), 10_000_000_000).unwrap();

    // Init vault (threshold = 2)
    let owners = vec![owner1.pubkey(), owner2.pubkey()];
    let (vault_pda, vault_bump) = derive_vault_pda(&pid, &owner1.pubkey());
    let init_ix = build_init_vault_ix(pid, &owner1, vault_pda, owners, 2, vault_bump);
    let tx = Transaction::new_signed_with_payer(
        &[init_ix],
        Some(&owner1.pubkey()),
        &[&owner1],
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx).unwrap();

    // Propose transfer of 1 SOL
    let (tx_pda, tx_bump) = derive_tx_pda(&pid, &vault_pda, 0);
    let propose_data = WalletInstruction::ProposeTransaction {
        to: recipient.pubkey(),
        amount: 1_000_000_000,
        memo: "Test transfer".to_string(),
        tx_bump,
    }
    .try_to_vec()
    .unwrap();
    let propose_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(owner1.pubkey(), true),
            AccountMeta::new(vault_pda, false),
            AccountMeta::new(tx_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: propose_data,
    };
    let tx = Transaction::new_signed_with_payer(
        &[propose_ix],
        Some(&owner1.pubkey()),
        &[&owner1],
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx).unwrap();

    // owner2 approves → threshold met → status becomes Approved
    let approve_data = WalletInstruction::ApproveTransaction { tx_index: 0 }
        .try_to_vec()
        .unwrap();
    let approve_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new_readonly(owner2.pubkey(), true),
            AccountMeta::new(vault_pda, false),
            AccountMeta::new(tx_pda, false),
        ],
        data: approve_data,
    };
    let tx = Transaction::new_signed_with_payer(
        &[approve_ix],
        Some(&owner2.pubkey()),
        &[&owner2],
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx).unwrap();

    let tx_account = svm.get_account(&tx_pda).unwrap();
    let record = TransactionRecord::try_from_slice(&tx_account.data).unwrap();
    assert_eq!(record.status, TxStatus::Approved);
    assert_eq!(record.approval_count(), 2);
}

#[test]
fn test_non_owner_cannot_approve() {
    let mut svm = LiteSvm::new();
    let pid = program_id();
    svm.add_program(pid, include_bytes!("../../target/deploy/sol_wallet.so"));

    let owner1 = Keypair::new();
    let intruder = Keypair::new();
    svm.airdrop(&owner1.pubkey(), 10_000_000_000).unwrap();
    svm.airdrop(&intruder.pubkey(), 10_000_000_000).unwrap();

    let owners = vec![owner1.pubkey()];
    let (vault_pda, vault_bump) = derive_vault_pda(&pid, &owner1.pubkey());
    let init_ix = build_init_vault_ix(pid, &owner1, vault_pda, owners, 1, vault_bump);
    let tx = Transaction::new_signed_with_payer(
        &[init_ix],
        Some(&owner1.pubkey()),
        &[&owner1],
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx).unwrap();

    let (tx_pda, tx_bump) = derive_tx_pda(&pid, &vault_pda, 0);
    let propose_data = WalletInstruction::ProposeTransaction {
        to: intruder.pubkey(),
        amount: 500_000_000,
        memo: "".to_string(),
        tx_bump,
    }
    .try_to_vec()
    .unwrap();
    let propose_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(owner1.pubkey(), true),
            AccountMeta::new(vault_pda, false),
            AccountMeta::new(tx_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: propose_data,
    };
    let tx = Transaction::new_signed_with_payer(
        &[propose_ix],
        Some(&owner1.pubkey()),
        &[&owner1],
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx).unwrap();

    // intruder tries to approve
    let approve_data = WalletInstruction::ApproveTransaction { tx_index: 0 }
        .try_to_vec()
        .unwrap();
    let approve_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new_readonly(intruder.pubkey(), true),
            AccountMeta::new(vault_pda, false),
            AccountMeta::new(tx_pda, false),
        ],
        data: approve_data,
    };
    let tx = Transaction::new_signed_with_payer(
        &[approve_ix],
        Some(&intruder.pubkey()),
        &[&intruder],
        svm.latest_blockhash(),
    );
    assert!(svm.send_transaction(tx).is_err(), "Non-owner should not be able to approve");
}
