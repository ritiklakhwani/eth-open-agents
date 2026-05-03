import fs from 'fs'
import path from 'path'

const POLL_MS = 50
const ACQUIRE_TIMEOUT_MS = 120_000
const STALE_MS = 300_000

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true })
}

/**
 * Serialize transactions sent from the same hot wallet across processes (Hub ENS
 * heartbeats vs pet-runtime BattleEscrow) to avoid nonce collisions and
 * "replacement transaction underpriced" from parallel eth_sendRawTransaction.
 */
export async function withDeployerTxLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T> {
  const dir = path.join(repoRoot, 'data')
  const lockPath = path.join(dir, '.deployer-tx.lock')
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS

  while (Date.now() < deadline) {
    try {
      ensureDir(dir)
      const fd = fs.openSync(lockPath, 'wx')
      try {
        fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }))
      } finally {
        fs.closeSync(fd)
      }
      try {
        return await fn()
      } finally {
        try {
          fs.unlinkSync(lockPath)
        } catch {
          /* ignore */
        }
      }
    } catch {
      try {
        const st = fs.statSync(lockPath)
        if (Date.now() - st.mtimeMs > STALE_MS) {
          try {
            fs.unlinkSync(lockPath)
          } catch {
            /* ignore */
          }
          continue
        }
      } catch {
        /* no lock file */
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
  }

  throw new Error(`deployer-tx-lock: could not acquire ${lockPath} within ${ACQUIRE_TIMEOUT_MS}ms`)
}
