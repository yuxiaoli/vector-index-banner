# Vector Index — ASCII Signal

Original, dependency-free Canvas 2D banner study. No external fonts, trackers, WebGL, or backend.

The text field is sampled through an inverse-radius twist; a custom bitmap wordmark resolves through a 42-second radial character dissolve. CRT scanlines and a restrained green phosphor offset are rendered with CSS and Canvas 2D.

## Run
Serve this directory with any static HTTP server. Run `npm run check` for JavaScript syntax validation.

## Reuse
Import `AsciiField` from `renderer.js`, instantiate it with a canvas, and call `destroy()` on unmount. Methods: `setPaused(boolean)`, `setReduced(boolean)`, and `replay()`. Options are exported as `DEFAULTS`; all timing uses elapsed seconds, independently of frame rate. CSS and the semantic HTML overlay are separate from the renderer.

## Accessibility and performance
Semantic heading with an aria-hidden decorative canvas; native keyboard-accessible controls; system reduced-motion support; a static readable HTML fallback; no sound or rapid strobing. Rendering stops when the page is hidden or the canvas leaves the viewport. 30 fps cap, capped time delta and 1.5 device pixel ratio limit. Narrow screens use a two-line wordmark.

This is an independent visual study. It does not connect to or modify the Vector Index production website.

Requested palette: #11FF00 on pure #000000.

## Slow-motion revision
- Reveal: 42 seconds after a 1.8-second lead-in, with gradual opacity and fixed-glyph dissolves.
- Vortex angular drift: 0.04 radians/second, about one turn every 2.6 minutes. The bright ribbons move visibly across the character grid within 2–5 seconds and keep flowing after the wordmark resolves.
- Arc phase advances at 0.09 radians/second; motion uses a continuous clock with no character-cell rounding or random frame switching.
- Background glyphs: a staggered 56-second cycle with 12-second crossfades; no frame-by-frame random scrambling.
- Pointer motion: subtle, eased over 2.4 seconds. Replay crossfades for 5.5 seconds rather than cutting to black.
- Brightness is continuous, avoiding the previous quantized opacity steps.
- System reduced-motion starts with a clearly identified still composition. Enable motion deliberately starts the flow for this page; pause and replay remain separate controls.

## Brighter moving glyphs
Dim background strokes use a continuous opacity lift and a semibold font, with a lighter black vignette and scanline overlay. This increases green pixel coverage and contrast while keeping the exact `#11FF00` pigment, pure black background, existing flow rates, and 42-second reveal. Brightness and absolute temporal-change regressions run alongside the original smoothness and lifecycle checks.
