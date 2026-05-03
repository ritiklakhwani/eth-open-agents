'use client'

/// PetParade — a row of pet sprites walking across the bottom of the hero.
/// Pure CSS (no JS frame loop). Each pet is given a different `animation-delay`
/// so they're spread evenly across the screen at any moment, and a different
/// `animation-duration` jitter (~±15%) so they don't visually clump.
///
/// Sprites picked by hand from apps/web/public/sprites/ — the 8 most distinct
/// silhouettes look best in a row. Using the same hashed filenames the rest
/// of the app uses; no new asset work needed.

const PARADE_SPRITES = [
  '/sprites/04d2290da1480576.png',
  '/sprites/2c397aac6ee3c8ac.png',
  '/sprites/355191e658d8211c.png',
  '/sprites/4c6812caf8d1d5cd.png',
  '/sprites/525b79b307d8130a.png',
  '/sprites/6ce9343ddae76fb8.png',
  '/sprites/89de6f10233f6232.png',
  '/sprites/90c88a5fca6744c8.png',
] as const

export function PetParade() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[170px] overflow-hidden"
      aria-hidden="true"
    >
      {PARADE_SPRITES.map((src, i) => (
        <div
          key={src}
          className="absolute bottom-[88px] animate-parade"
          style={{
            // Spread the 8 pets evenly through the 36s loop so the screen
            // always has 3-4 pets visible at any moment.
            animationDelay: `${-i * 4.5}s`,
            // Slight per-pet duration jitter so they overlap differently
            // each pass — feels less mechanical.
            animationDuration: `${34 + (i % 3) * 2}s`,
          }}
        >
          <div className="animate-pet-bob">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              width={64}
              height={64}
              className="pixelated"
              style={{
                // Flip every other pet horizontally so they don't all face
                // the same direction — but ALL still walk right (transform
                // applied to inner img, animation moves the wrapper).
                transform: i % 3 === 1 ? 'scaleX(-1)' : 'none',
              }}
            />
          </div>
        </div>
      ))}
      <div
        className="absolute bottom-0 inset-x-0 h-[88px]"
        style={{
          backgroundImage: 'linear-gradient(rgba(20, 50, 120, 0.45), rgba(20, 50, 120, 0.45)), url(https://img.freepik.com/free-photo/blank-concrete-white-wall-texture-background_1017-15560.jpg?semt=ais_hybrid&w=740&q=80)',
          backgroundSize: 'auto, auto 100%',
          backgroundRepeat: 'no-repeat, repeat-x',
        }}
      />
    </div>
  )
}
