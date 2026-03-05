#!/usr/bin/env tsx
/**
 * deploy.ts — Program deployment & post-deploy setup
 *
 * Usage:
 *   pnpm deploy:devnet     # deploy to devnet
 *   pnpm deploy:localnet   # deploy to local validator
 *
 * Env vars (see .env.example):
 *   NETWORK            localnet | devnet | mainnet
 *   DEPLOY_KEYPAIR     path to deployer keypair JSON
 *   PROGRAM_KEYPAIR    path to program keypair JSON (keeps address stable)
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const NETWORK = (process.env.NETWORK ?? "localnet") as "localnet" | "devnet" | "mainnet";

const RPC: Record<string, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
};

const DEPLOY_KEYPAIR = process.env.DEPLOY_KEYPAIR ?? `${process.env.HOME}/.config/solana/id.json`;
const PROGRAM_KEYPAIR = process.env.PROGRAM_KEYPAIR ?? "./program-keypair.json";
const SO_PATH = "./program/target/deploy/sol_wallet.so";

// ── Helpers ───────────────────────────────────────────────────────────────────

function run(cmd: string, label?: string): string {
  console.log(`\n▸ ${label ?? cmd}`);
  try {
    const out = execSync(cmd, { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] });
    if (out) process.stdout.write(out);
    return out.trim();
  } catch (e: any) {
    console.error(`✗ Command failed: ${cmd}`);
    console.error(e.stderr ?? e.message);
    process.exit(1);
  }
}

function checkPrereqs(): void {
  for (const tool of ["solana", "cargo"]) {
    try {
      execSync(`which ${tool}`, { stdio: "ignore" });
    } catch {
      console.error(`✗ '${tool}' not found in PATH. Please install Solana CLI and Rust.`);
      process.exit(1);
    }
  }
}

// ── Build ─────────────────────────────────────────────────────────────────────

function buildProgram(): void {
  run(
    "cargo build-sbf --manifest-path ./program/Cargo.toml",
    "Building SBF program…"
  );

  if (!fs.existsSync(SO_PATH)) {
    console.error(`✗ Build artifact not found at ${SO_PATH}`);
    process.exit(1);
  }
  console.log(`✓ Build artifact: ${SO_PATH}`);
}

// ── Deploy ────────────────────────────────────────────────────────────────────

function deployProgram(): string {
  const rpc = RPC[NETWORK];
  const keypairFlag = fs.existsSync(PROGRAM_KEYPAIR)
    ? `--program-id ${PROGRAM_KEYPAIR}`
    : "";

  const programId = run(
    `solana program deploy ${SO_PATH} \
      --url ${rpc} \
      --keypair ${DEPLOY_KEYPAIR} \
      ${keypairFlag} \
      --output json`,
    `Deploying to ${NETWORK} (${rpc})…`
  );

  // solana CLI outputs JSON; extract the program ID
  try {
    const parsed = JSON.parse(programId);
    return parsed.programId ?? parsed.program_id;
  } catch {
    // Fallback: last non-empty line
    return programId.split("\n").filter(Boolean).pop() ?? "";
  }
}

// ── Write constants ───────────────────────────────────────────────────────────

function patchProgramId(programId: string): void {
  // Patch .env
  const envPath = ".env";
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  if (envContent.includes("NEXT_PUBLIC_PROGRAM_ID=")) {
    envContent = envContent.replace(
      /NEXT_PUBLIC_PROGRAM_ID=.*/,
      `NEXT_PUBLIC_PROGRAM_ID=${programId}`
    );
  } else {
    envContent += `\nNEXT_PUBLIC_PROGRAM_ID=${programId}\n`;
  }
  fs.writeFileSync(envPath, envContent);
  console.log(`✓ Updated NEXT_PUBLIC_PROGRAM_ID in .env → ${programId}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n🚀 sol-wallet deploy script — target: ${NETWORK}\n`);
  checkPrereqs();
  buildProgram();
  const programId = deployProgram();
  console.log(`\n✓ Program deployed: ${programId}`);
  patchProgramId(programId);

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Deploy complete!

  Program ID : ${programId}
  Network    : ${NETWORK}

  Next steps:
  1. Run 'pnpm dev' in /app to start the dashboard
  2. Call InitVault to create your first treasury vault
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main();
