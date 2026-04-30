import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

// ESM doesn't expose __dirname; derive from import.meta.url. Repo root sits
// 3 levels above this file: apps/hub/src/axl-config.ts. Anchoring to the file
// (instead of process.cwd()) keeps config + key paths stable regardless of
// where the hub was launched from.
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
const REPO_ROOT  = path.resolve(__dirname, '..', '..', '..')

// Pet 0 is the bootstrap/rendezvous node — it Listens on P2P_BOOTSTRAP_PORT.
// All other pets connect outbound to pet 0 and don't need to Listen.
const P2P_BOOTSTRAP_PORT = 8001

export interface PetAxlConfig {
  PrivateKeyPath: string
  Peers: string[]
  Listen: string[]
  api_port: number
  bridge_addr: string
  tcp_port: number
  max_concurrent_conns: number
  configPath: string
}

export function generatePetAxlConfig(petId: number): PetAxlConfig {
  const configDir = path.join(REPO_ROOT, 'data', 'axl-configs')
  const keyDir    = path.join(REPO_ROOT, 'data', 'keys')

  mkdirSync(configDir, { recursive: true })
  mkdirSync(keyDir, { recursive: true })

  const keyPath = path.join(keyDir, `pet-${petId}.pem`)
  if (!existsSync(keyPath)) {
    execSync(`openssl genpkey -algorithm ed25519 -out "${keyPath}"`)
  }

  // api_port:  9001, 9101, 9201 … (HTTP API — what we POST /send to)
  // tcp_port:  7000, 7100, 7200 … (unique per pet so AXL can route via
  //            127.0.0.1:tcp_port instead of the gVisor virtual IPv6 that
  //            is unreachable across isolated namespaces).
  // Every pet explicitly Listen-s on its tcp_port so the address is
  // advertised to peers during bootstrap and is host-reachable.
  // Pet 0 additionally Listen-s on P2P_BOOTSTRAP_PORT so others can dial in.
  const TCP_PORT = 7000 + petId * 100

  const config = {
    PrivateKeyPath: keyPath,
    Peers: petId === 0 ? [] : [`tls://127.0.0.1:${P2P_BOOTSTRAP_PORT}`],
    Listen: [
      `tls://0.0.0.0:${TCP_PORT}`,
      ...(petId === 0 ? [`tls://0.0.0.0:${P2P_BOOTSTRAP_PORT}`] : []),
    ],
    api_port: 9001 + petId * 100,
    bridge_addr: '127.0.0.1',
    tcp_port: TCP_PORT,
    max_concurrent_conns: 16,
  }

  const configPath = path.join(configDir, `pet-${petId}.json`)
  writeFileSync(configPath, JSON.stringify(config, null, 2))

  return { ...config, configPath }
}