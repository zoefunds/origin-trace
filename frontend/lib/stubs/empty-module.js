// Stub for @base-org/account, which this app never uses (wallet
// connectivity goes entirely through Reown AppKit's connector list, not
// the Coinbase Smart Wallet / Base Account connector). The real package
// pulls in @coinbase/cdp-sdk, which in turn dynamically imports optional
// @x402/* packages this project doesn't install -- aliasing the whole
// chain out at this entry point keeps the build from trying to resolve
// dependencies of a feature that is never reached at runtime.
export function createBaseAccountSDK() {
  throw new Error("Base Account / Coinbase Smart Wallet connector is not supported in ORIGIN TRACE.");
}
export default { createBaseAccountSDK };
