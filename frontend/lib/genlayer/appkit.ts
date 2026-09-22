"use client";

import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { studionet } from "genlayer-js/chains";
import type { AppKitNetwork } from "@reown/appkit/networks";

// Reown (WalletConnect) project id -- this is a public, client-side
// identifier (it shows up in every wallet-connect QR/deep-link request),
// not a secret. Get your own at https://cloud.reown.com if you fork this.
const REOWN_PROJECT_ID = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "";

if (!REOWN_PROJECT_ID && typeof window !== "undefined") {
  console.error("NEXT_PUBLIC_REOWN_PROJECT_ID is not set -- wallet connection will fail");
}

// GenLayer Studio as a Reown/AppKit network definition. Reusing the same
// `studionet` viem chain genlayer-js exports keeps this in lockstep with
// the chain config genlayer-js itself uses for reads/writes.
const genlayerStudioNetwork: AppKitNetwork = {
  id: studionet.id,
  name: studionet.name,
  nativeCurrency: studionet.nativeCurrency,
  rpcUrls: studionet.rpcUrls,
  blockExplorers: studionet.blockExplorers,
} as AppKitNetwork;

export const wagmiAdapter = new WagmiAdapter({
  projectId: REOWN_PROJECT_ID,
  networks: [genlayerStudioNetwork],
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

/**
 * Reown AppKit gives ORIGIN TRACE a single connect flow that covers
 * MetaMask, Rainbow, Zerion, and any other WalletConnect-compatible wallet
 * (QR code + deep link), satisfying the "connect external wallets such as
 * MetaMask / Rainbow / Zerion" requirement without hand-rolling separate
 * integrations for each.
 *
 * Registered at module scope (matching Reown's own recommended setup)
 * rather than inside a component effect: the `useAppKit`/`useAppKitAccount`
 * hooks require a modal instance to already exist by the time they're
 * called, including during Next.js's server-side render/static-generation
 * pass, and createAppKit() is itself SSR-safe (it no-ops meaningfully on
 * the server rather than touching `window`).
 */
createAppKit({
  adapters: [wagmiAdapter],
  networks: [genlayerStudioNetwork],
  projectId: REOWN_PROJECT_ID,
  metadata: {
    name: "ORIGIN TRACE",
    description: "Claim you made it first. Let the public timeline decide.",
    url: typeof window !== "undefined" ? window.location.origin : "https://origintrace.app",
    icons: [typeof window !== "undefined" ? `${window.location.origin}/favicon.svg` : ""],
  },
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
  themeMode: "dark",
  themeVariables: {
    "--w3m-color-mix": "#00F0FF",
    "--w3m-color-mix-strength": 20,
    "--w3m-accent": "#00F0FF",
    "--w3m-border-radius-master": "2px",
  },
});
