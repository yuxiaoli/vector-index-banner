# Vector Index — ASCII Signal

Original, dependency-free Canvas 2D banner study. No external fonts, trackers, WebGL, or backend.

The text field is sampled through an inverse-radius twist. Individual characters follow deterministic curved paths, then gradually assemble into a custom bitmap wordmark. CRT scanlines and a restrained green phosphor offset are rendered with CSS and Canvas 2D.

## Run
Serve this directory with any static HTTP server. Run `npm run check` for JavaScript syntax validation.

## Reuse
Import `AsciiField` from `renderer.js`, instantiate it with a canvas, and call `destroy()` on unmount. Methods: `setPaused(boolean)`, `setReduced(boolean)`, and `replay()`. Options are exported as `DEFAULTS`; all timing uses elapsed seconds, independently of frame rate. CSS and the semantic HTML overlay are separate from the renderer.

## Accessibility and performance
Semantic heading with an aria-hidden decorative canvas; native keyboard-accessible controls; system reduced-motion support; a static readable HTML fallback; no sound or rapid strobing. Rendering stops when the page is hidden or the canvas leaves the viewport. 30 fps cap, capped time delta and 1.5 device pixel ratio limit. Narrow screens use a two-line wordmark.

This is an independent visual study. It does not connect to or modify the Vector Index production website.

Requested palette: #11FF00 on pure #000000.

## Motion and formation
- A 1.8-second lead-in and 18-second wandering phase precede 96 seconds of staggered assembly. The complete sequence lasts about 116 seconds.
- Local particle movement and text assembly use separate rates. Continuous curves and stable per-particle seeds create irregular drifting without frame-to-frame random jitter. Characters remain active while their spread gradually settles into the final letters.
- Vortex angular drift: 0.04 radians/second, about one turn every 2.6 minutes. The bright ribbons move visibly across the character grid within 2–5 seconds and keep flowing after the wordmark resolves.
- Arc phase advances at 0.09 radians/second; motion uses a continuous clock with no character-cell rounding or random frame switching.
- Background glyphs: a staggered 56-second cycle with 12-second crossfades; no frame-by-frame random scrambling.
- Pointer motion: subtle, eased over 2.4 seconds. Replay crossfades for 5.5 seconds rather than cutting to black.
- Brightness remains continuous. Background characters keep moving after formation; reduced motion draws a coherent still wordmark.
- System reduced-motion starts with a clearly identified still composition. Enable motion deliberately starts the flow for this page; pause and replay remain separate controls.

## Brighter moving glyphs
Dim background strokes retain the verified continuous opacity lift, semibold font, and lighter black vignette and scanline overlay. The exact `#11FF00` pigment and pure black background are unchanged. Brightness regressions run alongside path continuity, independent motion/assembly timing, replay, and lifecycle checks.
