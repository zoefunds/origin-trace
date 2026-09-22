import type { NextConfig } from "next";
import path from "node:path";

// @coinbase/cdp-sdk (pulled in transitively by @wagmi/connectors' Base
// Account / Coinbase Smart Wallet connector, which this app never uses --
// wallet connectivity here goes entirely through Reown AppKit's own
// connector list) ships dynamic imports for optional @x402/* packages that
// are not installed and that Next.js tries to statically resolve at build
// time. Aliasing the module to a trivial empty stub is safe: the code path
// that imports it is only reached if a user explicitly selects the
// Coinbase connector, which this app doesn't register.
const stubbedModules = {
  "@base-org/account": "./lib/stubs/empty-module.js",
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    resolveAlias: stubbedModules,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@base-org/account": path.resolve(__dirname, "lib/stubs/empty-module.js"),
    };
    return config;
  },
};

export default nextConfig;
