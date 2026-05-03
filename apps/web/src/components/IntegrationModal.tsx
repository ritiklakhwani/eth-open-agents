'use client'

import { useEffect, useState } from 'react'
import { PixelDialog } from './ui/PixelDialog'
import {
  etherscanTokenLink,
  etherscanAddressLink,
  etherscanIntelligenceCIDReadLink,
  ensAppLink,
  zeroGTxLink,
  ADDRESSES,
} from '@/lib/explorerLinks'

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? 'http://localhost:3001'

// Each partner zone in world.tmj sets a `partner` property which is one of:
// 'gensyn-axl' | 'ens' | 'keeperhub' | '0g'. This modal switches its panel
// based on which partner the player walked into.
export type PartnerKey = 'gensyn-axl' | 'ens' | 'keeperhub' | '0g'

const PARTNER_TITLE: Record<PartnerKey, string> = {
  'gensyn-axl': 'GENSYN AXL — MESH DIAGNOSTICS',
  'ens':        'ENS — IDENTITY REGISTRY',
  'keeperhub':  'KEEPERHUB — WORKFLOW DASHBOARD',
  '0g':         '0G — IDENTITY VAULT',
}

interface PetRow {
  tokenId:       number
  name:          string
  ensName:       string
  walletAddress: string
  ownerAddress:  string
  spriteUrl:     string
  blobCID:       string
  archetype:     string
  peerId:        string
  parentName?:   string
}

interface IntegrationModalProps {
  open:          boolean
  onClose:       () => void
  partner:       PartnerKey | null
  /// The active player pet — used as default selected pet in the 0G panel.
  activePetId:   number
}

export function IntegrationModal({ open, onClose, partner, activePetId }: IntegrationModalProps) {
  const [pets, setPets] = useState<PetRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  // Refresh pet list every time the modal opens.
  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`${HUB_URL}/api/pets`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((rows: unknown) => {
        if (!Array.isArray(rows)) { setPets([]); return }
        const mapped: PetRow[] = rows.map((r: Record<string, unknown>) => ({
          tokenId:       Number(r.token_id),
          name:          String(r.name ?? `pet-${r.token_id}`),
          ensName:       String(r.ens_name ?? ''),
          walletAddress: String(r.wallet_address ?? ''),
          ownerAddress:  String(r.owner_address ?? ''),
          spriteUrl:     String(r.sprite_url ?? ''),
          blobCID:       String(r.blob_cid ?? ''),
          archetype:     String(r.archetype ?? ''),
          peerId:        String(r.peer_id ?? ''),
          parentName:    r.parent_name ? String(r.parent_name) : undefined,
        }))
        setPets(mapped)
      })
      .catch(() => setPets([]))
      .finally(() => setLoading(false))
  }, [open])

  if (!partner) return null

  return (
    <PixelDialog open={open} onClose={onClose} title={PARTNER_TITLE[partner]} size="lg">
      <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
        {loading && (
          <p className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink-low)]">
            Loading pets…
          </p>
        )}
        {!loading && pets && partner === 'gensyn-axl'  && <AxlPanel pets={pets} />}
        {!loading && pets && partner === 'ens'         && <EnsPanel pets={pets} />}
        {!loading && pets && partner === 'keeperhub'   && <KeeperHubPanel />}
        {!loading && pets && partner === '0g'          && <ZeroGPanel pets={pets} activePetId={activePetId} />}
      </div>
    </PixelDialog>
  )
}

// ── AXL panel ──────────────────────────────────────────────────────────────
function AxlPanel({ pets }: { pets: PetRow[] }) {
  const online = pets.filter((p) => p.peerId)
  return (
    <>
      <Caption>
        Each pet runs its own AXL Yggdrasil process on a unique port (9001 + petId × 100).
        Direct P2P routing with Hub-relay fallback when TCP fails.
      </Caption>
      <StatRow stats={[
        { label: 'PETS ONLINE', value: String(online.length) },
        { label: 'TOTAL MINTED', value: String(pets.length) },
        { label: 'BOOTSTRAP', value: 'pet 0' },
      ]} />
      <table className="w-full font-[family-name:var(--font-pixel-readable)] text-sm">
        <thead>
          <tr className="text-[color:var(--color-ink-low)] text-[10px] uppercase tracking-widest">
            <th className="text-left py-1">Pet</th>
            <th className="text-left py-1">AXL peer-id</th>
            <th className="text-left py-1">Port</th>
            <th className="text-left py-1">Verify NFT</th>
          </tr>
        </thead>
        <tbody>
          {online.map((p) => (
            <tr key={p.tokenId} className="border-t border-[color:var(--color-yellow)]/15">
              <td className="py-1.5 text-[color:var(--color-ink)]">#{p.tokenId} {p.name}</td>
              <td className="py-1.5 text-[color:var(--color-cyan)] font-[family-name:var(--font-mono)] text-xs">{p.peerId.slice(0, 16)}…</td>
              <td className="py-1.5 text-[color:var(--color-ink-mid)]">{9001 + p.tokenId * 100}</td>
              <td className="py-1.5">
                <ExtLink href={etherscanTokenLink(p.tokenId)}>etherscan ↗</ExtLink>
              </td>
            </tr>
          ))}
          {online.length === 0 && (
            <tr><td colSpan={4} className="py-3 text-center text-[color:var(--color-ink-low)] italic">No pets online yet — boot the Hub.</td></tr>
          )}
        </tbody>
      </table>
    </>
  )
}

// ── ENS panel ──────────────────────────────────────────────────────────────
function EnsPanel({ pets }: { pets: PetRow[] }) {
  return (
    <>
      <Caption>
        Each pet has a Sepolia ENS subname (`&lt;name&gt;.tama.eth`). All pet identity — peerId,
        traits, mood, friends — lives in text records. Verifiable on-chain via Sepolia ENS app.
      </Caption>
      <StatRow stats={[
        { label: 'SUBNAMES MINTED', value: String(pets.filter((p) => p.ensName).length) },
        { label: 'BRED PETS', value: String(pets.filter((p) => p.parentName).length) },
        { label: 'RESOLVER', value: ADDRESSES.ENSPublicResolver.slice(0, 10) + '…' },
      ]} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {pets.filter((p) => p.ensName).slice(0, 12).map((p) => (
          <div key={p.tokenId} className="border border-[color:var(--color-yellow)]/20 bg-[rgba(10,12,46,0.45)] p-3">
            <div className="flex justify-between items-baseline">
              <span className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-yellow)]">
                #{p.tokenId} {p.name.toUpperCase()}
              </span>
              <span className="font-[family-name:var(--font-pixel-readable)] text-xs text-[color:var(--color-ink-low)]">
                {p.archetype}
              </span>
            </div>
            <div className="mt-1.5">
              <ExtLink href={ensAppLink(p.ensName)}>
                {p.ensName} ↗
              </ExtLink>
            </div>
            {p.parentName && (
              <div className="mt-1 font-[family-name:var(--font-pixel-readable)] text-xs text-[color:var(--color-ink-mid)]">
                child of <span className="text-[color:var(--color-cyan)]">{p.parentName}.tama.eth</span>
              </div>
            )}
            <div className="mt-1 font-[family-name:var(--font-pixel-readable)] text-xs text-[color:var(--color-ink-low)]">
              owner&nbsp;
              <ExtLink href={etherscanAddressLink(p.ownerAddress)}>{short(p.ownerAddress)} ↗</ExtLink>
            </div>
          </div>
        ))}
        {pets.filter((p) => p.ensName).length === 0 && (
          <p className="text-[color:var(--color-ink-low)] italic font-[family-name:var(--font-pixel-readable)] text-sm">
            No ENS subnames registered yet.
          </p>
        )}
      </div>
    </>
  )
}

// ── KeeperHub panel ────────────────────────────────────────────────────────
interface WorkflowRow {
  id:         string
  pet_id:     number
  kind:       string
  status:     string
  created_at: number
  payload?:   string | null
}

function KeeperHubPanel() {
  const [workflows, setWorkflows] = useState<WorkflowRow[] | null>(null)
  useEffect(() => {
    fetch(`${HUB_URL}/api/keeperhub/workflows`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : { workflows: [] })
      .then((d: { workflows?: WorkflowRow[] }) => setWorkflows(d.workflows ?? []))
      .catch(() => setWorkflows([]))
  }, [])
  // Group by kind for the primitives counter.
  const counts: Record<string, number> = {}
  for (const w of workflows ?? []) counts[w.kind] = (counts[w.kind] ?? 0) + 1
  return (
    <>
      <Caption>
        KeeperHub orchestrates 5 workflow primitives: recurring (allowance), scheduled (gifts),
        conditional (mailbox HERO), event-listener (adoption chain), and chained (sub cancellation).
        Every workflow row maps to a real on-chain transaction on Sepolia.
      </Caption>
      <StatRow stats={[
        { label: 'WORKFLOWS', value: String(workflows?.length ?? '—') },
        { label: 'KINDS', value: String(Object.keys(counts).length) },
        { label: 'ACTIVE', value: String((workflows ?? []).filter((w) => w.status === 'active').length) },
      ]} />
      {workflows && workflows.length > 0 ? (
        <table className="w-full font-[family-name:var(--font-pixel-readable)] text-sm">
          <thead>
            <tr className="text-[color:var(--color-ink-low)] text-[10px] uppercase tracking-widest">
              <th className="text-left py-1">Kind</th>
              <th className="text-left py-1">Pet</th>
              <th className="text-left py-1">Status</th>
              <th className="text-left py-1">Created</th>
              <th className="text-left py-1">ID</th>
            </tr>
          </thead>
          <tbody>
            {workflows.slice(0, 20).map((w) => (
              <tr key={w.id} className="border-t border-[color:var(--color-yellow)]/15">
                <td className="py-1.5 text-[color:var(--color-yellow)] uppercase text-xs tracking-wider">{w.kind}</td>
                <td className="py-1.5 text-[color:var(--color-ink)]">#{w.pet_id}</td>
                <td className="py-1.5 text-[color:var(--color-cyan)]">{w.status}</td>
                <td className="py-1.5 text-[color:var(--color-ink-low)] text-xs">{new Date(w.created_at).toLocaleTimeString()}</td>
                <td className="py-1.5 text-[color:var(--color-ink-mid)] font-[family-name:var(--font-mono)] text-xs">{w.id.slice(0, 12)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : workflows ? (
        <p className="text-[color:var(--color-ink-low)] italic font-[family-name:var(--font-pixel-readable)] text-sm">
          No workflows yet — try the Mailbox / Subscription flows to create one.
        </p>
      ) : (
        <p className="text-[color:var(--color-ink-low)] font-[family-name:var(--font-pixel-readable)] text-sm">Loading workflows…</p>
      )}
      <div className="mt-2">
        <ExtLink href="https://app.keeperhub.com">Open KeeperHub dashboard ↗</ExtLink>
      </div>
    </>
  )
}

// ── 0G Vault panel ─────────────────────────────────────────────────────────
interface OgStatus {
  cid:     string
  status:  'on-0g' | 'local-cache' | 'unreachable'
  message?: string
  data?:    unknown
  /// Set when og-storage's Go CLI upload captured a real on-chain tx hash.
  /// Null when the upload fell back to local cache (no chain submission).
  txHash?: string | null
}

function ZeroGPanel({ pets, activePetId }: { pets: PetRow[]; activePetId: number }) {
  const [selectedId, setSelectedId] = useState<number>(activePetId)
  const [ogStatus, setOgStatus]     = useState<OgStatus | null>(null)
  const [loadingStatus, setLoading] = useState(false)
  const sel = pets.find((p) => p.tokenId === selectedId) ?? pets[0]

  // Fetch 0G status whenever the selected pet changes.
  useEffect(() => {
    if (!sel?.blobCID) { setOgStatus(null); return }
    setLoading(true)
    fetch(`${HUB_URL}/api/integration/og-status/${sel.blobCID}`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((j: OgStatus | null) => setOgStatus(j))
      .catch(() => setOgStatus(null))
      .finally(() => setLoading(false))
  }, [sel?.blobCID])

  if (!sel) return <p className="text-[color:var(--color-ink-low)] italic">No pets to inspect.</p>

  return (
    <>
      <Caption>
        Pet identity blob (sprite + personality + memory) lives encrypted on 0G Storage.
        The blob CID is signed onto Sepolia as the ERC-7857 `intelligenceCID` — the iNFT pointer.
      </Caption>
      <div className="flex gap-2 flex-wrap mb-2">
        {pets.slice(0, 12).map((p) => (
          <button
            key={p.tokenId}
            onClick={() => setSelectedId(p.tokenId)}
            className={[
              'px-2 py-1 border font-[family-name:var(--font-pixel)] text-[10px] tracking-widest cursor-pointer',
              p.tokenId === selectedId
                ? 'bg-[color:var(--color-yellow)]/20 border-[color:var(--color-yellow)]/70 text-[color:var(--color-yellow)]'
                : 'bg-[rgba(10,12,46,0.5)] border-[color:var(--color-yellow)]/15 text-[color:var(--color-ink-mid)] hover:border-[color:var(--color-yellow)]/40',
            ].join(' ')}
          >
            #{p.tokenId} {p.name.slice(0, 8)}
          </button>
        ))}
      </div>
      <div className="border border-[color:var(--color-yellow)]/30 bg-[rgba(10,12,46,0.55)] p-4 flex gap-4">
        {sel.spriteUrl && !/\/sprites\/(sage|gremlin|athlete|joker|scholar)\.png$/.test(sel.spriteUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sel.spriteUrl} alt={sel.name} className="w-24 h-24 [image-rendering:pixelated] border-2 border-[color:var(--color-bg-deep)]" />
        ) : (
          <div className="w-24 h-24 bg-[rgba(10,12,46,0.7)] border-2 border-[color:var(--color-bg-deep)] flex items-center justify-center text-[color:var(--color-ink-low)] text-xs">
            no sprite
          </div>
        )}
        <div className="flex-1 flex flex-col gap-1.5">
          <Row label="NAME" value={`#${sel.tokenId} ${sel.name}`} />
          <Row label="ENS" value={sel.ensName} valueColor="cyan" />
          <Row label="ARCH" value={sel.archetype.toUpperCase()} />
          <Row label="0G CID" value={sel.blobCID ? sel.blobCID.slice(0, 18) + '…' : '(no blob)'} valueColor="lime" mono />
          <OgStatusBadge status={ogStatus} loading={loadingStatus} />
        </div>
      </div>
      <div className="flex gap-3 flex-wrap mt-2">
        <ExtLink href={etherscanIntelligenceCIDReadLink()}>
          ↗ Read intelligenceCID on Sepolia
        </ExtLink>
        <ExtLink href={etherscanTokenLink(sel.tokenId)}>
          ↗ View NFT on Etherscan
        </ExtLink>
        {ogStatus?.txHash && (
          <ExtLink href={zeroGTxLink(ogStatus.txHash)}>
            ↗ 0G chain tx ({ogStatus.txHash.slice(0, 10)}…)
          </ExtLink>
        )}
        {sel.blobCID && <CopyCidButton cid={sel.blobCID} />}
      </div>
      <p className="mt-3 font-[family-name:var(--font-pixel-readable)] text-xs text-[color:var(--color-ink-low)]">
        Click <span className="text-[color:var(--color-yellow)]">Read intelligenceCID</span> → call
        the contract function with token ID {sel.tokenId} → returns the same CID shown above.
        That&apos;s the iNFT pointer: brain encrypted on 0G, signature on Sepolia.
      </p>
    </>
  )
}

/// Renders the 0G status as a small inline badge instead of a broken-link
/// gauntlet. Three states:
///   on-0g       — blob registered on 0G storage indexer
///   local-cache — blob exists, fell back to local cache (testnet flow revert)
///   unreachable — indexer down / network error
function OgStatusBadge({ status, loading }: { status: OgStatus | null; loading: boolean }) {
  if (loading) {
    return <Row label="0G STATUS" value="checking…" valueColor="ink" />
  }
  if (!status) {
    return <Row label="0G STATUS" value="unknown" valueColor="ink" />
  }
  if (status.status === 'on-0g') {
    return <Row label="0G STATUS" value="✓ verified on 0G" valueColor="lime" />
  }
  if (status.status === 'local-cache') {
    return <Row label="0G STATUS" value="local cache (testnet flow revert)" valueColor="yellow" />
  }
  return <Row label="0G STATUS" value="indexer unreachable" valueColor="ink" />
}

// ── Tiny shared bits ───────────────────────────────────────────────────────
function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink-mid)] leading-relaxed">
      {children}
    </p>
  )
}

function StatRow({ stats }: { stats: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map((s) => (
        <div key={s.label} className="border border-[color:var(--color-yellow)]/20 bg-[rgba(10,12,46,0.4)] px-3 py-2">
          <div className="font-[family-name:var(--font-pixel)] text-[9px] uppercase tracking-widest text-[color:var(--color-ink-low)]">
            {s.label}
          </div>
          <div className="font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-yellow)] mt-1">
            {s.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-[family-name:var(--font-pixel)] text-xs tracking-wider text-[color:var(--color-yellow)] hover:underline cursor-pointer"
    >
      {children}
    </a>
  )
}

/// Copies the 0G CID to the clipboard. Useful when the indexer doesn't
/// resolve the CID (fallback-cached blob) — judges can paste it elsewhere.
function CopyCidButton({ cid }: { cid: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(cid).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
      className="font-[family-name:var(--font-pixel)] text-xs tracking-wider text-[color:var(--color-yellow)] hover:underline cursor-pointer"
    >
      {copied ? '✓ copied' : '⎘ copy CID'}
    </button>
  )
}

function Row({ label, value, valueColor, mono }: {
  label: string
  value: string
  valueColor?: 'cyan' | 'lime' | 'yellow' | 'ink'
  mono?: boolean
}) {
  const colorClass = {
    cyan:   'text-[color:var(--color-cyan)]',
    lime:   'text-[color:var(--color-lime)]',
    yellow: 'text-[color:var(--color-yellow)]',
    ink:    'text-[color:var(--color-ink)]',
  }[valueColor ?? 'ink']
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="font-[family-name:var(--font-pixel)] text-[9px] uppercase tracking-widest text-[color:var(--color-ink-low)]">
        {label}
      </span>
      <span className={`${mono ? 'font-[family-name:var(--font-mono)] text-xs' : 'font-[family-name:var(--font-pixel-readable)] text-sm'} ${colorClass}`}>
        {value}
      </span>
    </div>
  )
}

function short(addr: string): string {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}
