// CRT scanline + vignette overlay — fixed-position screen-wide effect.
// Renders above everything but doesn't intercept clicks.
//
// Toggle on/off in dev tools by removing .crt-scanlines class on the html node
// if it gets in the way of testing.

export function CRTOverlay() {
  return (
    <>
      <div className="crt-scanlines" aria-hidden="true" />
      <div className="crt-vignette" aria-hidden="true" />
    </>
  )
}
