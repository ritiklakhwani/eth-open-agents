import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import path from 'path'

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
  const repoRoot = path.resolve(process.cwd())
  const configDir = path.join(repoRoot, 'data', 'axl-configs')
  const keyDir = path.join(repoRoot, 'data', 'keys')

  mkdirSync(configDir, { recursive: true })
  mkdirSync(keyDir, { recursive: true })

  const keyPath = path.join(keyDir, `pet-${petId}.pem`)
  if (!existsSync(keyPath)) {
    execSync(`openssl genpkey -algorithm ed25519 -out ${keyPath}`)
  }

  // api_port: 9001, 9101, 9201 ... (HTTP API — what we curl /send /recv /topology)
  // tcp_port: fixed at 7000 for ALL pets. AXL uses the sender's tcp_port as the
  // destination port when delivering messages over gVisor. Each pet has its own
  // isolated gVisor virtual network stack, so port 7000 on each is independent.
  // Pet 0 listens on P2P_BOOTSTRAP_PORT for incoming peer connections.
  // Pet N>0 connects outbound to pet 0 and leaves Listen empty.
  const config = {
    PrivateKeyPath: keyPath,
    Peers: petId === 0 ? [] : [`tls://127.0.0.1:${P2P_BOOTSTRAP_PORT}`],
    Listen: petId === 0 ? [`tls://0.0.0.0:${P2P_BOOTSTRAP_PORT}`] : [],
    api_port: 9001 + petId * 100,
    bridge_addr: '127.0.0.1',
    tcp_port: 7000,
    max_concurrent_conns: 16,
  }

  const configPath = path.join(configDir, `pet-${petId}.json`)
  writeFileSync(configPath, JSON.stringify(config, null, 2))

  return { ...config, configPath }
}