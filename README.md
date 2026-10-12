# Vector Index — ASCII Fluid

Original, dependency-free Canvas 2D banner study. No external fonts, trackers, WebGL, or backend.

A shared clockwise fluid field carries the background characters and forming wordmark. Gentle, spatially coherent turbulence gives the flow variation. The pattern becomes clearer over time and blends smoothly into a stable custom bitmap wordmark while the surrounding field continues circulating.

## Run

Serve this directory with any static HTTP server. Run `npm run check` for syntax, motion, brightness, and control checks.

## Reuse

Import `AsciiField` from `renderer.js`, instantiate it with a canvas, and call `destroy()` on unmount. Methods: `setPaused(boolean)`, `setReduced(boolean)`, and `replay()`. Options are exported as `DEFAULTS`; all timing uses elapsed seconds, independently of frame rate. CSS and the semantic HTML overlay are separate from the renderer.

## Accessibility and performance

Semantic heading with an aria-hidden decorative canvas; native keyboard-accessible controls; system reduced-motion support; a static readable HTML fallback; no sound or rapid strobing. Rendering stops when the page is hidden or the canvas leaves the viewport. 30 fps cap, capped time delta and 1.5 device pixel ratio limit. Narrow screens use a two-line wordmark.

This independent visual study does not connect to or modify the Vector Index production website.

Requested palette: exact `#11FF00` on pure `#000000`.

## Flow and formation

- A 1.8-second lead-in and 18-second initial flow precede 96 seconds of formation. The complete sequence lasts 115.8 seconds.
- Background and forming characters use the same continuous clockwise field. Local turbulence remains subordinate to the common direction; motion is deterministic and has no frame-to-frame random jitter.
- The common flow advances at 0.10 radians per second, roughly one turn every 63 seconds. Its bounded paths keep characters inside the viewport.
- Fluid motion and text formation use separate clocks. Deformation reduces gradually, and complementary flowing and stationary text layers blend into the clear final wordmark. The angular flow never unwinds as the text resolves.
- The background continues circulating once the wordmark is readable. Brightness and glyph crossfades remain continuous.
- Background glyphs use a staggered 56-second cycle with 12-second crossfades.
- Pointer motion is subtle and eases over 2.4 seconds. Replay dissolves over 5.5 seconds and restarts the same sequence.
- System reduced-motion starts with a clearly identified still composition and complete wordmark. Enabling motion starts the flow for this page; pause and replay remain separate controls.

## Brightness

Dim background strokes retain the verified continuous opacity lift, semibold font, and lighter black vignette and scanline overlay. The exact pigment and pure black background are preserved. Brightness regressions run alongside clockwise direction, continuity, progressive legibility, replay, and lifecycle checks.

## GitHub Pages

The public website is served from the `develop` branch root at <https://yuxiaoli.github.io/vector-index-banner/>. All runtime assets use relative paths so the project works beneath `/vector-index-banner/`. The `main` branch retains the initial baseline.
