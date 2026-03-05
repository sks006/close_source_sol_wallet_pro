# ◎ sol-wallet-raw

A **raw, no-framework multi-sig treasury vault** on Solana — built with a native SBF Rust program, a `@solana/kit` v2 TypeScript SDK, and a Next.js dashboard.

No Anchor. No IDL generation. Every byte is intentional.

---

## Architecture

```
sol-wallet-raw/
├── program/          # SBF Rust program (on-chain)
├── sdk/              # TypeScript SDK (@solana/kit v2)
├── app/              # Next.js dashboard (frontend)
└── scripts/          # Deploy & local validator automation
```

### Program instructions

| Instruction         | Description                                              |
|---------------------|----------------------------------------------------------|
| `InitVault`         | Create a new multi-sig treasury (2–10 owners, threshold N) |
| `ProposeTransaction`| Propose a SOL transfer; proposer auto-approves          |
| `ApproveTransaction`| Cast an approval vote                                    |
| `RejectTransaction` | Cast a rejection vote                                    |
| `ExecuteTransaction`| Execute once threshold approvals are collected          |
| `CancelTransaction` | Cancel by original proposer (pre-execution only)        |
| `ChangeThreshold`   | Update the approval threshold                            |
| `AddOwner`          | Add a new co-signer                                      |
| `RemoveOwner`       | Remove a co-signer (threshold auto-clamps)               |

### PDA layout

| Account              | Seeds                              |
|----------------------|------------------------------------|
| Vault state          | `["vault", creator_pubkey]`        |
| Transaction record   | `["tx", vault_pubkey, tx_index_le]`|

---

## Prerequisites

| Tool                   | Version |
|------------------------|---------|
| Rust + Cargo           | stable  |
| Solana CLI             | ≥ 1.18  |
| Node.js                | ≥ 20    |
| pnpm                   | ≥ 9     |

---

## Quick start (localnet)

```bash
# 1. Clone and install JS deps
git clone https://github.com/you/sol-wallet-raw
cd sol-wallet-raw
pnpm install

# 2. Copy env
cp .env.example .env

# 3. Start local validator
pnpm localnet

# 4. Build + deploy program (new terminal)
pnpm deploy:localnet

# 5. Start dashboard
pnpm dev
# → http://localhost:3000
```

---

## Devnet deploy

```bash
# Make sure your CLI keypair has devnet SOL
solana airdrop 2 --url devnet

pnpm deploy:devnet
```

---

## Testing the program

```bash
# Unit + integration tests via LiteSVM (no local validator needed)
pnpm test:program
```

---

## Security model

- **PDA ownership** — all accounts must be owned by the program before deserialization.
- **Signer gates** — every mutating instruction requires the relevant owner to sign.
- **Duplicate vote prevention** — `has_voted()` check before recording any approval or rejection.
- **Memo bounds** — enforced at instruction level (max 128 bytes).
- **Arithmetic overflow** — all counters use `checked_add`.
- **Rent-exempt floor** — execution checks vault lamports above the rent-exempt minimum before transferring.

---

## Project scripts

| Command                | Action                                      |
|------------------------|---------------------------------------------|
| `pnpm localnet`        | Start local test validator                  |
| `pnpm build:program`   | Compile SBF program                         |
| `pnpm test:program`    | Run LiteSVM integration tests               |
| `pnpm deploy:localnet` | Build + deploy to local validator           |
| `pnpm deploy:devnet`   | Build + deploy to devnet                    |
| `pnpm build:sdk`       | Compile TypeScript SDK                      |
| `pnpm dev`             | Start Next.js dashboard (hot reload)        |
| `pnpm build`           | Production build (SDK + app)                |
| `pnpm clean`           | Remove all build artifacts                  |

---

## Extending

### Adding a new instruction

1. Add a variant to `WalletInstruction` in `program/src/instruction.rs`
2. Add a matching error variant in `error.rs` if needed
3. Implement the handler in `processor.rs` and match it in `Processor::process`
4. Add a builder function in `sdk/src/instructions.ts`
5. Write a LiteSVM test in `program/tests/integration_tests.rs`

---

## License

MIT
