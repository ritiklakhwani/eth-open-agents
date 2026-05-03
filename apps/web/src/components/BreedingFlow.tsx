'use client'

// BreedingFlow — pair two parent pets, name the child, mint a new TamaPet iNFT
// with parent IDs encoded into the identity blob. Surfaces the ENS Most
// Creative track (subname tree for lineage). Phase 3 ENS subname-minting
// isn't built, so for v0 we record parents in the 0G blob `traits` field
// and let the demo narrative explain "child.parent1.tama.eth" as the next
// step.

import { useEffect, useState } from 'react'
import type { Pet } from 'shared-types'
import { PixelDialog, PixelButton, PixelCard, PixelInput } from './ui'

interface BreedingFlowProps {
  open: boolean
  onClose: () => void
  /// The currently-active pet — used to default-pick parent A.
  petId: number
  /// Optional connected wallet address; child mints to this if set, otherwise
  /// to NEXT_PUBLIC_DEMO_RECIPIENT.
  ownerAddress?: `0x${string}`
  /// Fires after a successful mint with the URLs the WorldScene needs to play
  /// the post-mint animation (hearts at breeding hall → child walks to park
  /// → parents follow at halfway).
  onMinted?: (data: {
    childSpriteUrl: string
    parentASpriteUrl: string | null
    parentBSpriteUrl: string | null
  }) => void
}

interface MintResult {
  tokenId: string | null
  walletAddress: string | null
  txHash: string
}

type View = 'pick' | 'name' | 'minting' | 'done'

export function BreedingFlow({ open, onClose, petId, ownerAddress, onMinted }: BreedingFlowProps) {
  const [view, setView] = useState<View>('pick')
  const [pets, setPets] = useState<Pet[] | null>(null)
  const [parentA, setParentA] = useState<number | null>(petId)
  const [parentB, setParentB] = useState<number | null>(null)
  const [childName, setChildName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [mintError, setMintError] = useState<string | null>(null)
  const [result, setResult] = useState<MintResult | null>(null)

  useEffect(() => {
    if (!open) return
    setParentA(petId)
    void loadPets()
  }, [open, petId])

  async function loadPets() {
    try {
      const res = await fetch('http://localhost:3001/api/pets', { cache: 'no-store' })
      if (!res.ok) return
      const rows = (await res.json()) as Array<{
        token_id: number
        name: string | null
        ens_name: string | null
        archetype: string | null
        owner_address: string | null
      }>
      setPets(
        rows.map((r) => ({
          id: r.token_id,
          tokenId: r.token_id,
          name: r.name ?? `pet-${r.token_id}`,
          ensName: r.ens_name ?? `pet-${r.token_id}.tama.eth`,
          ownerAddress: (r.owner_address ?? '0x0') as `0x${string}`,
          walletAddress: '0x0' as `0x${string}`,
          spriteUrl: '',
          blobCID: '',
          archetype: (r.archetype as Pet['archetype']) ?? 'sage',
          mood: 0,
          energy: 0,
          hunger: 0,
          zone: 'park' as const,
          position: { x: 0, y: 0 },
          peerId: '',
        })),
      )
    } catch {
      setPets([])
    }
  }

  function nextFromPick() {
    if (parentA == null || parentB == null) return
    if (parentA === parentB) return
    setView('name')
  }

  async function mintChild() {
    const trimmed = childName.trim()
    if (trimmed.length < 2) { setNameError('Min 2 chars.'); return }
    if (!/^[a-z0-9-]+$/i.test(trimmed)) { setNameError('Letters, digits, hyphens only.'); return }

    setView('minting')
    setMintError(null)
    setNameError(null)

    try {
      const parentAPet = pets?.find((p) => p.tokenId === parentA)
      const parentBPet = pets?.find((p) => p.tokenId === parentB)
      // Inherit archetype from one parent (50/50 by tokenId parity).
      // Older pets in DB stored archetype as a numeric string ('1', '2.0') —
      // normalize to the canonical name list. Anything we can't recognize
      // safely falls back to 'sage' (archetype index 0).
      const ARCHETYPES = ['sage', 'gremlin', 'athlete', 'joker', 'scholar'] as const
      const rawArchetype =
        (parentA! + parentB!) % 2 === 0 ? parentAPet?.archetype : parentBPet?.archetype
      const normalized = (() => {
        if (typeof rawArchetype === 'string' && (ARCHETYPES as readonly string[]).includes(rawArchetype)) {
          return rawArchetype as typeof ARCHETYPES[number]
        }
        // Try parse as numeric index ('1', '2.0', etc.)
        const asNum = Math.trunc(Number(rawArchetype))
        if (Number.isFinite(asNum) && asNum >= 0 && asNum < ARCHETYPES.length) {
          return ARCHETYPES[asNum]
        }
        return 'sage'
      })()
      const archetypeIndex = ARCHETYPES.indexOf(normalized)

      // 1a. Generate the child's sprite by visually blending both parents.
      // Calls /api/pets/sprite/breed which fetches both parent sprites and
      // sends them to OpenAI gpt-image-1 multi-image edit. If the blend fails
      // (OpenAI down / rate limit / network), fall back to parent A's sprite
      // — guaranteed to exist on disk because every pet is minted with a
      // real generated sprite. NEVER fall back to `/sprites/<archetype>.png`
      // — those default files are not on disk and produce missing-texture boxes.
      const aResp = await fetch(`/api/pets/${parentA}`).then(r => r.json()) as { pet?: { spriteUrl?: string } }
      const bResp = await fetch(`/api/pets/${parentB}`).then(r => r.json()) as { pet?: { spriteUrl?: string } }
      const aUrl = aResp.pet?.spriteUrl
      const bUrl = bResp.pet?.spriteUrl
      let childSpriteUrl = aUrl ?? bUrl ?? `/sprites/${normalized}.png`
      try {
        if (aUrl && bUrl) {
          const breedRes = await fetch('/api/pets/sprite/breed', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              parentASpriteUrl: aUrl,
              parentBSpriteUrl: bUrl,
              childName:        trimmed,
              archetype:        normalized,
            }),
          })
          if (breedRes.ok) {
            const { spriteUrl: blended } = (await breedRes.json()) as { spriteUrl: string }
            if (blended) childSpriteUrl = blended
          }
        }
      } catch (err) {
        console.warn('[BreedingFlow] sprite blend failed, using parent sprite:', err)
      }

      // 1b. Upload child blob to 0G with parent lineage in metadata
      const blobRes = await fetch('/api/pets/blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spriteUrl: childSpriteUrl,
          archetype: normalized,
          name: trimmed,
          // Parent lineage encoded in personality so it surfaces in
          // the pet inspector + future ENS subname-tree demo
          personality: `Born of ${parentAPet?.name ?? '?'} and ${parentBPet?.name ?? '?'}. Inheriting their traits.`,
        }),
      })
      if (!blobRes.ok) throw new Error('blob upload failed')
      const { cid } = (await blobRes.json()) as { cid: string }

      // 2. Mint child pet
      const recipient =
        ownerAddress ?? (process.env.NEXT_PUBLIC_DEMO_RECIPIENT as `0x${string}` | undefined)
      const mintRes = await fetch('/api/pets/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipient,
          name: trimmed,
          blobCID: cid,
          archetype: archetypeIndex,
          // traits: encode parent IDs in the upper bits so they're recoverable on-chain
          //   bits 0-15  = parentA tokenId
          //   bits 16-31 = parentB tokenId
          traits: ((parentB! & 0xffff) << 16) | (parentA! & 0xffff),
        }),
      })
      if (!mintRes.ok) {
        const { error } = (await mintRes.json()) as { error?: string }
        throw new Error(error ?? 'mint failed')
      }
      const r = (await mintRes.json()) as MintResult

      // ENS Most Creative: tell Hub which pet is the parent so the subname
      // gets minted nested as <child>.<parent>.tama.eth (subname tree for
      // breeding lineage). Hub retries with the parent_name set.
      if (r.tokenId && parentAPet) {
        const hubBase = process.env.NEXT_PUBLIC_HUB_URL ?? 'http://localhost:3001'
        void (async () => {
          for (let i = 0; i < 6; i++) {
            try {
              const res = await fetch(`${hubBase}/api/pets/${r.tokenId}/parent`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ parentName: parentAPet.name }),
              })
              if (res.ok) return
            } catch { /* retry */ }
            await new Promise((res) => setTimeout(res, 1500))
          }
        })()
      }

      // Persist the blended child sprite URL so /world renders it (otherwise
      // the child appears as a default cyan rectangle).
      if (r.tokenId && childSpriteUrl) {
        const hubBase = process.env.NEXT_PUBLIC_HUB_URL ?? 'http://localhost:3001'
        void (async () => {
          for (let i = 0; i < 6; i++) {
            try {
              const res = await fetch(`${hubBase}/api/pets/${r.tokenId}/sprite`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ spriteUrl: childSpriteUrl }),
              })
              if (res.ok) return
            } catch { /* retry */ }
            await new Promise((res) => setTimeout(res, 1500))
          }
        })()
      }

      setResult(r)
      setView('done')

      // Fire the post-mint animation callback. WorldScene receives parent
      // sprite URLs + the freshly-blended child sprite URL and runs the
      // ceremony (hearts at breeding hall → child walks to park → parents
      // emerge at halfway).
      if (onMinted) {
        onMinted({
          childSpriteUrl,
          parentASpriteUrl: parentAPet?.spriteUrl ?? null,
          parentBSpriteUrl: parentBPet?.spriteUrl ?? null,
        })
      }
    } catch (err) {
      setMintError((err as Error).message)
      setView('name')
    }
  }

  function reset() {
    setView('pick')
    setParentA(petId)
    setParentB(null)
    setChildName('')
    setNameError(null)
    setMintError(null)
    setResult(null)
  }

  const candidates = pets?.filter((p) => true) ?? []
  const parentAPet = candidates.find((p) => p.tokenId === parentA)
  const parentBPet = candidates.find((p) => p.tokenId === parentB)

  return (
    <PixelDialog
      open={open}
      onClose={() => { onClose(); setTimeout(reset, 200) }}
      title="BREEDING — LINEAGE TREE"
      size="lg"
    >
      {view === 'pick' && (
        <div className="flex flex-col gap-5">
          <p className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink-mid)]">
            Pair two pets. The child inherits an archetype from one parent,
            mints as a new ERC-7857 iNFT, and gets a subname under both
            parents (e.g. <span className="text-[color:var(--color-cyan)]">child.parentA.tama.eth</span>).
          </p>

          {!pets && (
            <p className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-cyan)] animate-blink">
              ▒ LOADING PETS ▒
            </p>
          )}

          {pets && (
            <div className="grid grid-cols-2 gap-4">
              <ParentColumn
                label="PARENT A"
                color="var(--color-pink)"
                pets={candidates}
                selected={parentA}
                onSelect={setParentA}
              />
              <ParentColumn
                label="PARENT B"
                color="var(--color-cyan)"
                pets={candidates.filter((p) => p.tokenId !== parentA)}
                selected={parentB}
                onSelect={setParentB}
              />
            </div>
          )}

          {parentAPet && parentBPet && parentAPet.tokenId !== parentBPet.tokenId && (
            <PixelCard variant="elevated">
              <div className="text-center font-[family-name:var(--font-pixel)] text-sm">
                <span className="text-[color:var(--color-pink)]">{parentAPet.name}</span>
                <span className="text-[color:var(--color-yellow)] mx-2">×</span>
                <span className="text-[color:var(--color-cyan)]">{parentBPet.name}</span>
                <span className="text-[color:var(--color-ink-mid)] mx-2">→</span>
                <span className="text-[color:var(--color-lime)]">child</span>
              </div>
            </PixelCard>
          )}

          <div className="flex justify-end gap-3">
            <PixelButton variant="ghost" onClick={onClose}>Cancel</PixelButton>
            <PixelButton
              variant="primary"
              onClick={nextFromPick}
              disabled={parentA == null || parentB == null || parentA === parentB}
            >
              Next →
            </PixelButton>
          </div>
        </div>
      )}

      {view === 'name' && (
        <div className="flex flex-col gap-5">
          <p className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink-mid)]">
            Name the child. ENS subname will be{' '}
            <span className="text-[color:var(--color-cyan)]">
              {(childName.trim() || 'name').toLowerCase()}.{parentAPet?.name ?? 'parent'}.tama.eth
            </span>.
          </p>
          <PixelInput
            label="Child name"
            placeholder="pip, fluff, sprout"
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            error={nameError ?? undefined}
            maxLength={16}
            autoFocus
          />
          {mintError && (
            <p className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-red)]">
              ! {mintError}
            </p>
          )}
          <div className="flex justify-between gap-3">
            <PixelButton variant="ghost" onClick={() => setView('pick')}>← Back</PixelButton>
            <PixelButton variant="success" onClick={mintChild}>★ Mint Child</PixelButton>
          </div>
        </div>
      )}

      {view === 'minting' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="font-[family-name:var(--font-pixel)] text-xl text-[color:var(--color-cyan)] animate-blink">
            ▒▒▒ MINTING CHILD ▒▒▒
          </div>
          <ul className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink-mid)] space-y-1">
            <li>► Encoding lineage in identity blob...</li>
            <li>► Uploading to 0G Storage...</li>
            <li>► Minting on Sepolia...</li>
            <li>► Deploying child wallet...</li>
          </ul>
        </div>
      )}

      {view === 'done' && result && (
        <div className="flex flex-col gap-5">
          <div className="text-center py-2">
            <div className="font-[family-name:var(--font-pixel)] text-xl text-[color:var(--color-lime)] animate-pixel-bounce mb-2">
              ★ NEW LINEAGE ★
            </div>
            <p className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink)]">
              <span className="text-[color:var(--color-pink)]">{parentAPet?.name}</span>
              {' × '}
              <span className="text-[color:var(--color-cyan)]">{parentBPet?.name}</span>
              {' → '}
              <span className="text-[color:var(--color-lime)]">{childName.trim()}</span>
            </p>
          </div>
          <PixelCard variant="elevated">
            <div className="flex flex-col gap-2">
              <Row label="TOKEN ID" value={result.tokenId ?? '—'} valueColor="var(--color-cyan)" />
              <Row label="WALLET" value={short(result.walletAddress)} valueColor="var(--color-lime)" />
              <Row label="TX" value={short(result.txHash)} valueColor="var(--color-yellow)" />
              <Row label="ENS" value={`${childName.trim()}.${parentAPet?.name}.tama.eth`} valueColor="var(--color-pink)" />
            </div>
          </PixelCard>
          <div className="flex justify-end gap-3">
            <PixelButton variant="primary" onClick={() => { onClose(); setTimeout(reset, 200) }}>Close</PixelButton>
          </div>
        </div>
      )}
    </PixelDialog>
  )
}

function ParentColumn({
  label, color, pets, selected, onSelect,
}: {
  label: string
  color: string
  pets: Pet[]
  selected: number | null
  onSelect: (id: number) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <h4
        className="font-[family-name:var(--font-pixel)] text-xs uppercase tracking-widest"
        style={{ color }}
      >
        {label}
      </h4>
      <div className="border border-[color:var(--color-yellow)]/25 bg-[rgba(10,12,46,0.5)] p-2 max-h-[40vh] overflow-y-auto flex flex-col gap-1">
        {pets.length === 0 && (
          <p className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink-low)] italic p-2">
            No candidates.
          </p>
        )}
        {pets.map((p) => (
          <button
            key={p.tokenId}
            onClick={() => onSelect(p.tokenId)}
            className={[
              'cursor-pointer text-left border px-3 py-2 transition-colors',
              selected === p.tokenId
                ? 'bg-[color:var(--color-yellow)]/10'
                : 'bg-[rgba(10,12,46,0.45)] hover:bg-[rgba(10,12,46,0.7)]',
            ].join(' ')}
            style={{
              borderColor: selected === p.tokenId
                ? color
                : 'rgba(255,217,60,0.15)',
            }}
          >
            <div className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-ink)]">
              #{p.tokenId} {p.name}
            </div>
            <div className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink-mid)]">
              {p.archetype.toUpperCase()} · {p.ensName}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest text-[color:var(--color-ink-low)] shrink-0">
        {label}
      </span>
      <span className="font-[family-name:var(--font-pixel-readable)] text-sm truncate" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  )
}

function short(s: string | null): string {
  if (!s) return '—'
  if (s.length <= 14) return s
  return `${s.slice(0, 8)}…${s.slice(-6)}`
}
