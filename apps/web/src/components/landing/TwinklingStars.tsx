'use client'

/// TwinklingStars — a sparse field of 4-point pixel stars layered over the
/// hero's night sky portion of world-bg. Each star is an absolutely-positioned
/// `★` glyph with a randomised animation-delay so the field flickers without
/// any predictable pattern.
///
/// Positions are deterministic (seed-free) so SSR and CSR markup match —
/// using a hashing-style index → coord mapping rather than Math.random.

const STAR_COUNT = 28

interface Star {
  topPct:  number
  leftPct: number
  size:    number
  delay:   number
  color:   string
}

function buildStars(): Star[] {
  // Sky occupies roughly the top 50% of the hero. Spread stars across the
  // top 45% only so they never overlap pets on the street.
  const stars: Star[] = []
  for (let i = 0; i < STAR_COUNT; i++) {
    const topPct  = (i * 53)  % 45               // 0–45%
    const leftPct = (i * 167) % 100              // 0–100%
    const size    = (i % 3 === 0) ? 14 : 10      // mix of small + medium
    const delay   = (i * 0.31) % 2.4             // 0–2.4s
    const color   = (i % 4 === 0) ? 'var(--color-cyan)'
                  : (i % 4 === 1) ? 'var(--color-yellow)'
                  : '#ffffff'
    stars.push({ topPct, leftPct, size, delay, color })
  }
  return stars
}

const STARS = buildStars()

export function TwinklingStars() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {STARS.map((s, i) => (
        <span
          key={i}
          className="absolute animate-twinkle font-[family-name:var(--font-pixel)] select-none"
          style={{
            top:                `${s.topPct}%`,
            left:               `${s.leftPct}%`,
            fontSize:           `${s.size}px`,
            color:              s.color,
            animationDelay:     `${s.delay}s`,
            // Slight blur-free pixel rendering for the glyph
            textShadow:         '0 0 6px rgba(255, 255, 255, 0.4)',
          }}
        >
          ★
        </span>
      ))}
    </div>
  )
}
