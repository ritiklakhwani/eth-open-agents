import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Disable StrictMode — double-mounting in dev breaks Phaser scene lifecycle
  // (two scenes, two sockets, race conditions). Re-enable later if needed.
  reactStrictMode: false,
}

export default nextConfig
