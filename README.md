# Vector Index — ASCII Signal

Original, dependency-free Canvas 2D banner study. No external fonts, trackers, WebGL, or backend.

Individual characters follow seeded, irregular curved paths before gradually assembling into a custom bitmap wordmark. Their scattered starting positions do not depend on the final letters. The background samples an imaginary text grid through an inverse-radius twist, with moving ribbons, CRT scanlines, and a restrained green phosphor offset.

## Run

Serve this directory with any static HTTP server. Run `npm run check` for syntax, motion, brightness, and control checks.

The restoration regression compares rendered frames with commit `192cd7374e791883865bf88a65d50c3010104ad8`. Checks require Git and that commit in local history; a normal full clone supplies it.

## Reuse

Import `AsciiField` from `renderer.js`, instantiate it with a canvas, and call `destroy()` on unmount. Methods: `setPaused(boolean)`, `setReduced(boolean)`, `setFlowSpeed(multiplier)`, `setFormationDuration(seconds)`, and `replay()`. Options are exported as `DEFAULTS`; all timing uses elapsed seconds, independently of frame rate. CSS and the semantic HTML overlay are separate from the renderer.

## Accessibility and performance

Semantic heading with an aria-hidden decorative canvas; native keyboard-accessible controls; system reduced-motion support; a static readable HTML fallback; no sound or rapid strobing. Rendering stops when the page is hidden or the canvas leaves the viewport. 30 fps cap, capped time delta and 1.5 device pixel ratio limit. Narrow screens use a two-line wordmark.

This independent visual study does not connect to or modify the Vector Index production website.

Requested palette: exact `#11FF00` on pure `#000000`.

## Motion and formation

- The default 1.8-second lead-in and 18-second initial flow precede 96 seconds of formation. The default complete sequence lasts 115.8 seconds.
- Local movement and text assembly use independent clocks. Overlapping smooth curves and stable per-particle seeds create irregular wandering without frame-to-frame random jitter. Each character stays within the viewport while its spread gradually settles into the final letters.
- At the default 1× flow speed, the background vortex advances at 0.04 radians per second, about one turn every 2.6 minutes. The ribbons move visibly across the character grid within a few seconds; the arc phase advances at 0.09 radians per second.
- The wordmark resolves into precise, stable letters. Background characters and ribbons keep moving after formation; brightness and glyph crossfades remain continuous.
- At 1× flow speed, background glyphs use a staggered 56-second cycle with 12-second crossfades. Changing flow speed also changes future curve, vortex, arc, shimmer, and glyph-cycle movement through the same integrated flow clock.
- Pointer motion is subtle and eases over 2.4 seconds. Replay dissolves over 5.5 seconds and restarts the same sequence.
- System reduced-motion starts with a clearly identified still composition and complete wordmark. Enabling motion starts the flow for this page; pause and replay remain separate controls.

## Independent controls

Flow speed ranges from 0.25× to 2×. Changing it preserves the current flow phase, particle positions, and formation progress, then changes future movement speed.

Formation duration ranges from 10 to 180 seconds and defaults to 96 seconds. It describes the formation phase; the initial 19.8 seconds are separate. Changing duration preserves current progress and changes the remaining pace. It does not restart the animation. Replay begins a full cycle with the selected speed and duration.

Both settings remain adjustable while paused or in reduced motion, without starting movement. Native labelled range inputs support keyboard and touch interaction, with visible values and explanatory help.

## Brightness

Dim background strokes retain the verified continuous opacity lift, semibold font, and lighter black vignette and scanline overlay. The exact pigment and pure black background are preserved. Brightness regressions run alongside wandering-path continuity, independent motion and assembly timing, final wordmark accuracy, replay, and lifecycle checks.

## GitHub Pages

The public website is served from the `develop` branch root at <https://yuxiaoli.github.io/vector-index-banner/>. All runtime assets use relative paths so the project works beneath `/vector-index-banner/`. The `main` branch retains the initial baseline.
