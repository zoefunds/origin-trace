import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { tryReserveGenlayerRequest } from "./redis.js";

const RPC_URL = process.env.GENLAYER_RPC_URL || "https://studio.genlayer.com/api";
const CONTRACT_ADDRESS = (process.env.CONTRACT_ADDRESS || "").trim();

function buildClient() {
  const chain = {
    ...studionet,
    rpcUrls: { default: { http: [RPC_URL] } },
  };
  return createClient({ chain, endpoint: RPC_URL });
}

const client = buildClient();

export class GenlayerBudgetExceededError extends Error {
  constructor() {
    super("GenLayer daily request budget exceeded -- serving cached data instead");
    this.name = "GenlayerBudgetExceededError";
  }
}

/**
 * Every direct GenLayer RPC call in this backend goes through this one
 * function so the daily-budget reservation in redis.ts is never
 * accidentally bypassed by a call added somewhere else later.
 */
async function readContract<T>(functionName: string, args: unknown[] = []): Promise<T> {
  if (!CONTRACT_ADDRESS) {
    throw new Error("CONTRACT_ADDRESS is not configured yet -- deploy the contract first");
  }
  const reserved = await tryReserveGenlayerRequest(1);
  if (!reserved) {
    throw new GenlayerBudgetExceededError();
  }
  return client.readContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName,
    args: args as any[],
  }) as Promise<T>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return (value as Record<string, unknown>) ?? {};
}

export async function getContractInfo() {
  const raw = await readContract<string>("get_contract_info");
  return asRecord(raw) as { owner: string; current_time: number; total_disputes: number; total_claims: number };
}

export async function getDispute(disputeId: string) {
  const raw = await readContract<string>("get_dispute", [disputeId]);
  return asRecord(raw);
}

export async function getDisputeClaims(disputeId: string): Promise<string[]> {
  const raw = await readContract<string>("get_dispute_claims", [disputeId]);
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return Array.isArray(parsed) ? parsed : [];
}

export async function getClaim(claimId: string) {
  const raw = await readContract<string>("get_claim", [claimId]);
  return asRecord(raw);
}
