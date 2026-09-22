"use client";

import Link from "next/link";
import { Logo } from "./Logo";
import { WalletButton } from "./WalletButton";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="text-sm font-semibold tracking-tight">ORIGIN TRACE</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
          <Link href="/" className="hover:text-foreground">
            Disputes
          </Link>
          <Link href="/create" className="hover:text-foreground">
            File a Dispute
          </Link>
          <Link href="/profile" className="hover:text-foreground">
            My Activity
          </Link>
        </nav>
        <WalletButton />
      </div>
    </header>
  );
}
