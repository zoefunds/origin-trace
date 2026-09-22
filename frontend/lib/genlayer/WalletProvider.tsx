"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { studionet } from "genlayer-js/chains";
import "./appkit";
import { error as toastError } from "../utils/toast";

export interface WalletState {
  address: string | null;
  chainId: number | null;
  isConnected: boolean;
  isLoading: boolean;
  isOnCorrectNetwork: boolean;
}

interface WalletContextValue extends WalletState {
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchToGenlayerNetwork: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

/**
 * Thin wrapper over wagmi + Reown AppKit that exposes the same simple
 * shape the rest of the app expects (address / isConnected / connect /
 * disconnect), while the actual wallet-selection UI (MetaMask, Rainbow,
 * Zerion, WalletConnect QR, ...) is handled entirely by AppKit's modal.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const { open } = useAppKit();
  const { address, chainId, isConnected, isConnecting, isReconnecting } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();

  const connectWallet = async () => {
    await open();
  };

  const disconnectWallet = () => {
    disconnect();
  };

  const switchToGenlayerNetwork = async () => {
    try {
      await switchChainAsync({ chainId: studionet.id });
    } catch (err: any) {
      toastError("Failed to switch network", {
        description: err?.message || "Please switch to GenLayer Studio manually in your wallet.",
      });
      throw err;
    }
  };

  const value: WalletContextValue = {
    address: address ?? null,
    chainId: chainId ?? null,
    isConnected,
    isLoading: isConnecting || isReconnecting,
    isOnCorrectNetwork: chainId === studionet.id,
    connectWallet,
    disconnectWallet,
    switchToGenlayerNetwork,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
