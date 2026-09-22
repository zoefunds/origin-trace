"use client";

import { useWallet } from "@/lib/genlayer/WalletProvider";
import { formatAddress } from "@/lib/format";
import { Button } from "@/components/ui/button";

export function WalletButton() {
  const { address, isConnected, isLoading, isOnCorrectNetwork, connectWallet, disconnectWallet, switchToGenlayerNetwork } =
    useWallet();

  if (!isConnected) {
    return (
      <Button onClick={() => connectWallet()} disabled={isLoading} className="font-mono text-xs">
        {isLoading ? "CONNECTING..." : "CONNECT WALLET"}
      </Button>
    );
  }

  if (!isOnCorrectNetwork) {
    return (
      <Button onClick={() => switchToGenlayerNetwork()} variant="destructive" className="font-mono text-xs">
        WRONG NETWORK — SWITCH
      </Button>
    );
  }

  return (
    <Button onClick={() => disconnectWallet()} variant="secondary" className="font-mono text-xs">
      {formatAddress(address)}
    </Button>
  );
}
