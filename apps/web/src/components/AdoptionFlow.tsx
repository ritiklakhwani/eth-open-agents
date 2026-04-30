'use client'

import {
  useState,
  useRef,
  useEffect,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import { PixelDialog, PixelButton, PixelCard, PixelInput } from './ui'

type Archetype = 'sage' | 'gremlin' | 'athlete' | 'joker' | 'scholar'

interface ArchetypeMeta {
  id: Archetype
  emoji: string
  blurb: string
  color: 'pink' | 'cyan' | 'lime' | 'yellow' | 'purple'
}

const ARCHETYPES: ArchetypeMeta[] = [
  { id: 'sage',    emoji: '[ S ]', blurb: 'Calm. Cryptic. Speaks in riddles.',     color: 'cyan'   },
  { id: 'gremlin', emoji: '[ G ]', blurb: 'Chaotic. Pranks. Loves trouble.',       color: 'pink'   },
  { id: 'athlete', emoji: '[ A ]', blurb: 'Hyped. Competitive. Wants the win.',    color: 'lime'   },
  { id: 'joker',   emoji: '[ J ]', blurb: 'Pun-obsessed. Crowd-pleaser.',          color: 'yellow' },
  { id: 'scholar', emoji: '[ K ]', blurb: 'Curious. Cites obscure facts.',         color: 'purple' },
]

const COLOR_HEX: Record<ArchetypeMeta['color'], string> = {
  pink:   'var(--color-pink)',
  cyan:   'var(--color-cyan)',
  lime:   'var(--color-lime)',
  yellow: 'var(--color-yellow)',
  purple: 'var(--color-purple)',
}

type Step = 'name' | 'archetype' | 'sprite' | 'review' | 'minting' | 'done'
type SpriteMode = 'camera' | 'upload' | 'prompt'

interface AdoptionFlowProps {
  open: boolean
  onClose: () => void
  /// Optional connected-wallet address. Until phase B (RainbowKit) lands we
  /// fall back to a server-controlled recipient.
  ownerAddress?: `0x${string}`
}

interface MintResult {
  tokenId: string | null
  walletAddress: string | null
  txHash: string
}

export function AdoptionFlow({ open, onClose, ownerAddress }: AdoptionFlowProps) {
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [archetype, setArchetype] = useState<Archetype>('sage')
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null)
  const [spriteLoading, setSpriteLoading] = useState(false)
  const [spriteError, setSpriteError] = useState<string | null>(null)
  const [spriteMode, setSpriteMode] = useState<SpriteMode>('camera')
  const [promptText, setPromptText] = useState('')
  const [mintError, setMintError] = useState<string | null>(null)
  const [mintResult, setMintResult] = useState<MintResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  function reset() {
    setStep('name')
    setName('')
    setNameError(null)
    setArchetype('sage')
    setSpriteUrl(null)
    setSpriteLoading(false)
    setSpriteError(null)
    setSpriteMode('camera')
    setPromptText('')
    setMintError(null)
    setMintResult(null)
    stopCamera()
  }

  function handleClose() {
    onClose()
    setTimeout(reset, 200)
  }

  function goNext(from: Step) {
    if (from === 'name') {
      const trimmed = name.trim()
      if (trimmed.length < 2) {
        setNameError('Name must be at least 2 characters.')
        return
      }
      if (trimmed.length > 16) {
        setNameError('Name must be 16 chars or fewer.')
        return
      }
      if (!/^[a-z0-9-]+$/i.test(trimmed)) {
        setNameError('Letters, digits, hyphens only (ENS-friendly).')
        return
      }
      setNameError(null)
      setStep('archetype')
    } else if (from === 'archetype') {
      setStep('sprite')
    } else if (from === 'sprite') {
      stopCamera()
      setStep('review')
    }
  }

  // Camera lifecycle — bind/unbind to step + spriteMode
  useEffect(() => {
    if (step === 'sprite' && spriteMode === 'camera') {
      void startCamera()
    } else {
      stopCamera()
    }
    return stopCamera
  }, [step, spriteMode])

  async function startCamera() {
    setCameraError(null)
    setCameraReady(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraReady(true)
      }
    } catch (err) {
      setCameraError(
        (err as Error).message.includes('Permission')
          ? 'Camera permission denied — try Upload or Prompt instead.'
          : `Camera unavailable: ${(err as Error).message}`,
      )
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraReady(false)
  }

  async function captureFrame() {
    const video = videoRef.current
    if (!video || !cameraReady) return
    const canvas = document.createElement('canvas')
    const size = Math.min(video.videoWidth, video.videoHeight)
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Center crop to square
    const sx = (video.videoWidth - size) / 2
    const sy = (video.videoHeight - size) / 2
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size)
    canvas.toBlob(async (blob) => {
      if (!blob) return
      const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' })
      await submitPhoto(file)
    }, 'image/jpeg', 0.92)
  }

  async function submitPhoto(file: File) {
    setSpriteLoading(true)
    setSpriteError(null)
    try {
      const fd = new FormData()
      fd.append('photo', file)
      fd.append('archetype', archetype)
      const res = await fetch('/api/pets/sprite', { method: 'POST', body: fd })
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: string }
        throw new Error(error ?? `sprite gen failed (${res.status})`)
      }
      const { spriteUrl: url } = (await res.json()) as { spriteUrl: string }
      setSpriteUrl(url)
    } catch (err) {
      setSpriteError((err as Error).message)
    } finally {
      setSpriteLoading(false)
    }
  }

  async function submitPrompt() {
    const trimmed = promptText.trim()
    if (trimmed.length < 4) {
      setSpriteError('Prompt must be at least 4 characters.')
      return
    }
    setSpriteLoading(true)
    setSpriteError(null)
    try {
      const fd = new FormData()
      fd.append('prompt', trimmed)
      fd.append('archetype', archetype)
      const res = await fetch('/api/pets/sprite', { method: 'POST', body: fd })
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: string }
        throw new Error(error ?? `sprite gen failed (${res.status})`)
      }
      const { spriteUrl: url } = (await res.json()) as { spriteUrl: string }
      setSpriteUrl(url)
    } catch (err) {
      setSpriteError((err as Error).message)
    } finally {
      setSpriteLoading(false)
    }
  }

  function onFileInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void submitPhoto(file)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) void submitPhoto(file)
  }

  async function mintPet() {
    setStep('minting')
    setMintError(null)
    try {
      // 1. Upload identity blob to 0G Storage
      const blobRes = await fetch('/api/pets/blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spriteUrl: spriteUrl ?? defaultSpriteFor(archetype),
          archetype,
          name: name.trim(),
        }),
      })
      if (!blobRes.ok) {
        const { error } = (await blobRes.json()) as { error?: string }
        throw new Error(error ?? 'blob upload failed')
      }
      const { cid } = (await blobRes.json()) as { cid: string }

      // 2. Mint on Sepolia
      const recipient = ownerAddress ?? (process.env.NEXT_PUBLIC_DEMO_RECIPIENT as `0x${string}` | undefined)
      const mintRes = await fetch('/api/pets/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipient,
          name: name.trim(),
          blobCID: cid,
          archetype: ARCHETYPES.findIndex(a => a.id === archetype),
          traits: 0,
        }),
      })
      if (!mintRes.ok) {
        const { error } = (await mintRes.json()) as { error?: string }
        throw new Error(error ?? 'mint failed')
      }
      const result = (await mintRes.json()) as MintResult
      setMintResult(result)
      setStep('done')
    } catch (err) {
      setMintError((err as Error).message)
      setStep('review')
    }
  }

  return (
    <PixelDialog
      open={open}
      onClose={handleClose}
      title={titleFor(step)}
      size="lg"
      hideCloseButton={step === 'minting'}
    >
      {step === 'name' && (
        <div className="flex flex-col gap-6">
          <p className="font-[family-name:var(--font-pixel-readable)] text-lg text-[color:var(--color-ink-mid)]">
            Choose a name for your pet. This becomes their ENS subname:
            <span className="text-[color:var(--color-cyan)]"> {(name.trim() || 'name').toLowerCase()}.tama.eth</span>
          </p>
          <PixelInput
            label="Pet name"
            placeholder="e.g. mira, rusty, tofu"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={nameError ?? undefined}
            autoFocus
            maxLength={16}
          />
          <div className="flex justify-end gap-3">
            <PixelButton variant="ghost" onClick={handleClose}>Cancel</PixelButton>
            <PixelButton variant="primary" onClick={() => goNext('name')}>Next →</PixelButton>
          </div>
        </div>
      )}

      {step === 'archetype' && (
        <div className="flex flex-col gap-6">
          <p className="font-[family-name:var(--font-pixel-readable)] text-lg text-[color:var(--color-ink-mid)]">
            Pick a personality. This shapes how your pet speaks, plays, and forms friendships.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ARCHETYPES.map((a) => {
              const selected = archetype === a.id
              return (
                <button
                  key={a.id}
                  onClick={() => setArchetype(a.id)}
                  className={[
                    'cursor-pointer text-left border-4 p-4 transition-none',
                    'shadow-[4px_4px_0_0_var(--color-bg-deep)]',
                    'active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_0_var(--color-bg-deep)]',
                    selected
                      ? 'bg-[color:var(--color-bg-hi)]'
                      : 'bg-[color:var(--color-bg-mid)] hover:bg-[color:var(--color-bg-hi)]',
                  ].join(' ')}
                  style={{ borderColor: selected ? COLOR_HEX[a.color] : 'var(--color-border)' }}
                >
                  <div
                    className="font-[family-name:var(--font-pixel)] text-sm uppercase mb-2"
                    style={{ color: COLOR_HEX[a.color] }}
                  >
                    {a.emoji} {a.id}
                  </div>
                  <div className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink-mid)]">
                    {a.blurb}
                  </div>
                </button>
              )
            })}
          </div>
          <div className="flex justify-between gap-3">
            <PixelButton variant="ghost" onClick={() => setStep('name')}>← Back</PixelButton>
            <PixelButton variant="primary" onClick={() => goNext('archetype')}>Next →</PixelButton>
          </div>
        </div>
      )}

      {step === 'sprite' && (
        <div className="flex flex-col gap-6">
          <p className="font-[family-name:var(--font-pixel-readable)] text-lg text-[color:var(--color-ink-mid)]">
            Generate your pet&apos;s sprite. Use your camera, upload a photo, or describe it in words.
          </p>

          {/* Mode tabs */}
          <div className="grid grid-cols-3 border-4 border-[color:var(--color-bg-deep)]">
            {(['camera', 'upload', 'prompt'] as const).map((mode) => {
              const active = spriteMode === mode
              return (
                <button
                  key={mode}
                  onClick={() => { setSpriteError(null); setSpriteMode(mode) }}
                  className={[
                    'font-[family-name:var(--font-pixel)] text-xs uppercase tracking-widest py-3 cursor-pointer',
                    active
                      ? 'bg-[color:var(--color-pink)] text-[color:var(--color-bg-deep)]'
                      : 'bg-[color:var(--color-bg-mid)] text-[color:var(--color-ink-mid)] hover:bg-[color:var(--color-bg-hi)]',
                  ].join(' ')}
                >
                  {modeLabel(mode)}
                </button>
              )
            })}
          </div>

          {/* Live preview if we already have a sprite */}
          {spriteUrl && (
            <div className="border-4 border-[color:var(--color-lime)] bg-[color:var(--color-bg-deep)] p-4 flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={spriteUrl} alt="Generated sprite" className="w-24 h-24 [image-rendering:pixelated]" />
              <div className="flex flex-col gap-1">
                <span className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-lime)]">★ READY ★</span>
                <span className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink-mid)]">
                  Generate again to replace, or hit Next to continue.
                </span>
              </div>
            </div>
          )}

          {/* Camera mode */}
          {spriteMode === 'camera' && (
            <div className="flex flex-col gap-4">
              <div className="border-4 border-[color:var(--color-border)] bg-[color:var(--color-bg-deep)] aspect-square max-w-md mx-auto w-full overflow-hidden flex items-center justify-center">
                {cameraError ? (
                  <div className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-red)] p-4 text-center">
                    {cameraError}
                  </div>
                ) : (
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover [image-rendering:auto]"
                  />
                )}
              </div>
              <div className="flex justify-center">
                <PixelButton
                  variant="primary"
                  onClick={captureFrame}
                  disabled={!cameraReady || spriteLoading}
                  loading={spriteLoading}
                >
                  ◉ Capture & Generate
                </PixelButton>
              </div>
            </div>
          )}

          {/* Upload mode */}
          {spriteMode === 'upload' && (
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer border-4 border-dashed border-[color:var(--color-border)] hover:border-[color:var(--color-cyan)] bg-[color:var(--color-bg-deep)] p-8 text-center transition-none min-h-[200px] flex items-center justify-center"
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileInput}
              />
              {spriteLoading ? (
                <div className="font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-cyan)] animate-blink">
                  ▒ GENERATING ▒
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="font-[family-name:var(--font-pixel)] text-sm text-[color:var(--color-ink-mid)]">
                    ► DROP PHOTO HERE ◄
                  </span>
                  <span className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink-low)]">
                    or click to browse
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Prompt mode */}
          {spriteMode === 'prompt' && (
            <div className="flex flex-col gap-4">
              <PixelInput
                label="Describe your pet"
                placeholder="a fluffy cyan dragon with star eyes"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                maxLength={200}
              />
              <div className="flex justify-end">
                <PixelButton
                  variant="primary"
                  onClick={submitPrompt}
                  disabled={spriteLoading || promptText.trim().length < 4}
                  loading={spriteLoading}
                >
                  ✦ Generate
                </PixelButton>
              </div>
            </div>
          )}

          {spriteError && (
            <div className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-red)]">
              ! {spriteError}
            </div>
          )}

          <div className="flex justify-between gap-3">
            <PixelButton variant="ghost" onClick={() => setStep('archetype')}>← Back</PixelButton>
            <div className="flex gap-3">
              <PixelButton
                variant="ghost"
                onClick={() => { setSpriteUrl(null); stopCamera(); setStep('review') }}
              >
                Skip — use default
              </PixelButton>
              <PixelButton
                variant="primary"
                onClick={() => goNext('sprite')}
                disabled={spriteLoading || !spriteUrl}
              >
                Next →
              </PixelButton>
            </div>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="flex flex-col gap-6">
          <PixelCard variant="cyan" title="REVIEW">
            <div className="flex gap-6 items-start">
              <div className="w-24 h-24 border-4 border-[color:var(--color-bg-deep)] bg-[color:var(--color-bg-deep)] flex items-center justify-center shrink-0">
                {spriteUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={spriteUrl} alt="Pet sprite" className="w-full h-full object-contain [image-rendering:pixelated]" />
                ) : (
                  <span className="font-[family-name:var(--font-pixel)] text-xl" style={{ color: COLOR_HEX[ARCHETYPES.find(a => a.id === archetype)!.color] }}>
                    {ARCHETYPES.find(a => a.id === archetype)!.emoji}
                  </span>
                )}
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <Row label="NAME" value={name.trim()} valueColor="var(--color-pink)" />
                <Row label="ENS" value={`${name.trim().toLowerCase()}.tama.eth`} valueColor="var(--color-cyan)" />
                <Row label="ARCHETYPE" value={archetype.toUpperCase()} valueColor={COLOR_HEX[ARCHETYPES.find(a => a.id === archetype)!.color]} />
                <Row label="SPRITE" value={spriteUrl ? 'Custom (Gemini)' : 'Default'} valueColor="var(--color-ink)" />
              </div>
            </div>
          </PixelCard>
          <p className="font-[family-name:var(--font-pixel-readable)] text-sm text-[color:var(--color-ink-low)]">
            Minting will (1) upload your pet&apos;s identity blob to 0G Storage, (2) mint an ERC-7857 iNFT on Sepolia,
            and (3) deploy a CREATE2 smart wallet for your pet.
          </p>
          {mintError && (
            <div className="border-4 border-[color:var(--color-red)] bg-[color:var(--color-bg-deep)] p-3 font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-red)]">
              ! {mintError}
            </div>
          )}
          <div className="flex justify-between gap-3">
            <PixelButton variant="ghost" onClick={() => setStep('sprite')}>← Back</PixelButton>
            <PixelButton variant="success" onClick={mintPet}>★ Mint Pet</PixelButton>
          </div>
        </div>
      )}

      {step === 'minting' && (
        <div className="flex flex-col items-center gap-6 py-8">
          <div className="font-[family-name:var(--font-pixel)] text-xl text-[color:var(--color-cyan)] animate-blink">
            ▒▒▒ MINTING ▒▒▒
          </div>
          <ul className="font-[family-name:var(--font-pixel-readable)] text-base text-[color:var(--color-ink-mid)] space-y-2">
            <li>► Bundling identity blob...</li>
            <li>► Uploading to 0G Storage...</li>
            <li>► Submitting mint tx on Sepolia...</li>
            <li>► Deploying pet wallet...</li>
          </ul>
        </div>
      )}

      {step === 'done' && mintResult && (
        <div className="flex flex-col gap-6">
          <div className="text-center py-4">
            <div className="font-[family-name:var(--font-pixel)] text-2xl text-[color:var(--color-lime)] mb-2 animate-pixel-bounce">
              ★ PET ADOPTED ★
            </div>
            <div className="font-[family-name:var(--font-pixel-readable)] text-xl text-[color:var(--color-ink)]">
              Welcome to PetCity, <span className="text-[color:var(--color-pink)]">{name.trim()}</span>!
            </div>
          </div>
          <PixelCard variant="elevated">
            <div className="flex flex-col gap-2">
              <Row label="TOKEN ID" value={mintResult.tokenId ?? '—'} valueColor="var(--color-cyan)" />
              <Row label="WALLET" value={short(mintResult.walletAddress)} valueColor="var(--color-lime)" />
              <Row label="TX" value={short(mintResult.txHash)} valueColor="var(--color-yellow)" />
            </div>
          </PixelCard>
          <div className="flex justify-end gap-3">
            <PixelButton variant="ghost" onClick={handleClose}>Close</PixelButton>
            <a href={`/world?pet=${mintResult.tokenId ?? 1}`}>
              <PixelButton variant="primary">▶ Enter PetCity</PixelButton>
            </a>
          </div>
        </div>
      )}
    </PixelDialog>
  )
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest text-[color:var(--color-ink-low)]">
        {label}
      </span>
      <span
        className="font-[family-name:var(--font-pixel-readable)] text-base truncate"
        style={{ color: valueColor }}
      >
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

function defaultSpriteFor(archetype: Archetype): string {
  return `/sprites/${archetype}.png`
}

function modeLabel(m: SpriteMode): string {
  switch (m) {
    case 'camera': return '◉ CAMERA'
    case 'upload': return '↑ UPLOAD'
    case 'prompt': return '✦ PROMPT'
  }
}

function titleFor(step: Step): string {
  switch (step) {
    case 'name':      return 'ADOPT — STEP 1 / 4 — NAME'
    case 'archetype': return 'ADOPT — STEP 2 / 4 — PERSONALITY'
    case 'sprite':    return 'ADOPT — STEP 3 / 4 — APPEARANCE'
    case 'review':    return 'ADOPT — STEP 4 / 4 — REVIEW'
    case 'minting':   return 'MINTING ON SEPOLIA'
    case 'done':      return 'PET CITY — NEW CITIZEN'
  }
}
