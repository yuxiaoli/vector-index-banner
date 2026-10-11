import assert from 'node:assert/strict';
import { AsciiField, DEFAULTS, timingAt, glyphStateAt } from '../renderer.js';

let nextId = 1, callbacks = new Map(), dimensions = { width: 1440, height: 900 };
const calls = { text: 0, fill: 0 }, listeners = {};
let samples = new Map(), backgroundCells = new Map();
globalThis.requestAnimationFrame = fn => { const id = nextId++; callbacks.set(id, fn); return id; };
globalThis.cancelAnimationFrame = id => callbacks.delete(id);
globalThis.window = { devicePixelRatio: 3, addEventListener() {}, removeEventListener() {} };
globalThis.document = {
  hidden: false,
  addEventListener(name, fn) { listeners[name] = fn; }, removeEventListener() {},
  createElement() { return { width: 0, height: 0, getContext() { return { drawImage() {} }; } }; }
};
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.IntersectionObserver = class { constructor(fn) { this.fn = fn; } observe() {} disconnect() {} };
const context = {
  setTransform() {}, fillRect() { calls.fill++; }, drawImage() {},
  fillText(char, x, y) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    assert.equal(char.length, 1);
    calls.text++;
    const key = [char, x, y].join('|'), alpha = this.globalAlpha ?? 1;
    samples.set(key, (samples.get(key) || 0) + alpha);
    // The background is drawn centered on its grid; wordmark commands use top alignment.
    // Sum both crossfade glyphs so this metric measures flow, not character replacement.
    if (this.textBaseline === 'middle') {
      const cell = [x, y].join('|');
      backgroundCells.set(cell, (backgroundCells.get(cell) || 0) + alpha);
    }
  }
};
const canvas = {
  getContext(type) { assert.equal(type, '2d'); return context; },
  getBoundingClientRect() { return { ...dimensions, left: 0, top: 0 }; },
  parentElement: { addEventListener() {}, removeEventListener() {} }
};
const field = new AsciiField(canvas);
function frame(seconds) {
  samples = new Map(); backgroundCells = new Map();
  field.time = seconds; field.render();
  return { glyphs: samples, cells: backgroundCells };
}
function difference(a, b) {
  const keys = new Set([...a.keys(), ...b.keys()]);
  let massA = 0, massB = 0, absolute = 0, maximum = 0, visible = 0;
  for (const key of keys) {
    const x = a.get(key) || 0, y = b.get(key) || 0, delta = Math.abs(x - y);
    massA += x; massB += y; absolute += delta; maximum = Math.max(maximum, delta);
    if (delta >= .015) visible++;
  }
  return { relativeL1: absolute / ((massA + massB) / 2), visibleFraction: visible / keys.size, maximum };
}
function resize(width, height) {
  dimensions = { width, height }; field.resize();
  assert.ok(field.title.every(p => p.x >= 0 && p.x < width && p.y >= 0 && p.y < height), `wordmark fits ${width}x${height}`);
}

assert.equal(field.dpr, 1.5);
assert.ok(field.title.length > 500);
assert.equal(callbacks.size, 1);
frame(8); assert.ok(calls.text > 1000);
for (const [width, height] of [[390, 844], [320, 568], [700, 540], [844, 390], [280, 653], [1920, 1080]]) {
  resize(width, height); frame(8);
}

assert.equal(DEFAULTS.revealSeconds, 42);
assert.equal(timingAt(1.8).progress, 0);
assert.equal(timingAt(22.8).progress, .5);
assert.equal(timingAt(43.8).progress, 1);
assert.ok(timingAt(8).progress < .15, 'reveal remains deliberately slow at 8 seconds');
assert.ok(Math.abs((timingAt(301).spin - timingAt(300).spin) - (timingAt(1).spin - timingAt(0).spin)) < 1e-12, 'no startup acceleration');

for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
  resize(width, height);
  const base = frame(60), two = difference(base.cells, frame(62).cells), five = difference(base.cells, frame(65).cells);
  const label = `${width}x${height}`;
  // Broad alpha redistribution must remain perceptible after the wordmark completes.
  // These floors reject the old nearly static field; they do not count title shimmer.
  assert.ok(two.relativeL1 >= .35, `${label}: sufficient background flow over 2s (${two.relativeL1})`);
  assert.ok(two.visibleFraction >= .25, `${label}: at least 25% of cells change alpha by .015 over 2s (${two.visibleFraction})`);
  assert.ok(five.relativeL1 >= .55, `${label}: sustained background flow over 5s (${five.relativeL1})`);
  assert.ok(five.visibleFraction >= .35, `${label}: at least 35% of cells change alpha by .015 over 5s (${five.visibleFraction})`);
  // Keep the existing .01 no-flicker bound, including early reveal and late glyph cycles.
  const checkpoints = [0, 8, 20, 42, 100, 560];
  for (let seconds = 60; seconds <= 65; seconds += .5) checkpoints.push(seconds);
  let maximum = 0;
  for (const seconds of checkpoints) {
    const previous = frame(seconds), current = frame(seconds + 1 / 30);
    const delta = difference(previous.glyphs, current.glyphs).maximum;
    maximum = Math.max(maximum, delta);
    assert.ok(delta < .01, `${label}: no frame opacity jumps at ${seconds}s (${delta})`);
  }
  console.log(`Flow ${label}: 2s L1=${two.relativeL1.toFixed(3)}, changed=${two.visibleFraction.toFixed(3)}; 5s L1=${five.relativeL1.toFixed(3)}, changed=${five.visibleFraction.toFixed(3)}; max frame alpha=${maximum.toFixed(5)}`);
}

const glyphWeights = state => {
  const out = new Map([[state.from, 1 - state.blend]]);
  out.set(state.to, (out.get(state.to) || 0) + state.blend); return out;
};
for (let seconds = 0; seconds < 120; seconds += .05) {
  const a = glyphWeights(glyphStateAt(17, 31, seconds)), b = glyphWeights(glyphStateAt(17, 31, seconds + .001));
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    assert.ok(Math.abs((a.get(key) || 0) - (b.get(key) || 0)) < .001, 'glyph cycle is continuous');
  }
}

// Drive the actual queued RAF callback, so cancellation and rescheduling are tested too.
let clock = 1000;
function advanceFrame(now) {
  assert.equal(callbacks.size, 1);
  const [id, callback] = callbacks.entries().next().value;
  callbacks.delete(id); callback(now);
  assert.equal(callbacks.size, 1, 'only one RAF is pending');
}
function expectFrozen(stop, resume, label) {
  const time = field.time, fade = field.replayElapsed, frames = field.frameCount;
  stop(); assert.equal(callbacks.size, 0, `${label} cancels RAF`);
  field.tick(clock + 5000);
  assert.equal(field.time, time, `${label} freezes the animation clock`);
  assert.equal(field.replayElapsed, fade, `${label} freezes replay dissolve`);
  assert.equal(field.frameCount, frames, `${label} does not draw`);
  resume(); clock += 6000; advanceFrame(clock);
  assert.equal(field.time, time, `${label} resumes without elapsed-time catch-up`);
  assert.equal(field.replayElapsed, fade, `${label} fade resumes without a jump`);
  clock += 1000 / 30; advanceFrame(clock);
  assert.ok(Math.abs(field.time - time - 1 / 30) < 1e-12, `${label} continues normal frame time`);
}
field.time = 100; field.replay();
assert.ok(field.replaySnapshot, 'replay preserves the previous frame');
assert.equal(field.replayElapsed, 0); assert.equal(field.time, 0);
advanceFrame(clock); clock += 1000 / 30; advanceFrame(clock);
expectFrozen(() => field.setPaused(true), () => field.setPaused(false), 'pause');
expectFrozen(() => { document.hidden = true; listeners.visibilitychange(); }, () => { document.hidden = false; listeners.visibilitychange(); }, 'hidden tab');
expectFrozen(() => field.intersection.fn([{ isIntersecting: false }]), () => field.intersection.fn([{ isIntersecting: true }]), 'offscreen');
const beforeGap = field.time;
clock += 10000; advanceFrame(clock);
assert.ok(Math.abs(field.time - beforeGap - .075) < 1e-12, 'an unexpected long RAF gap is capped');

field.setReduced(true);
assert.equal(field.replaySnapshot, null); assert.equal(callbacks.size, 0);
const still = frame(0);
field.pointer = { x: 8, y: -6 };
const laterStill = frame(900);
assert.deepEqual(laterStill.glyphs, still.glyphs, 'reduced motion draws a stable fully revealed composition');
assert.deepEqual(laterStill.cells, still.cells, 'reduced motion stops the background too');
const reducedTime = field.time, reducedFrames = field.frameCount;
field.tick(clock + 10000); field.replay();
assert.equal(field.time, reducedTime, 'reduced motion ignores tick and replay');
assert.equal(field.frameCount, reducedFrames); assert.equal(callbacks.size, 0);
field.setPaused(true); field.setReduced(false);
assert.equal(callbacks.size, 0, 'enabling motion preserves a deliberate pause');
field.setPaused(false); const beforeResume = field.time;
clock += 10000; advanceFrame(clock);
assert.equal(field.time, beforeResume, 'deliberately enabling motion does not catch up frozen time');
field.replay(); clock += 1000 / 30; advanceFrame(clock);
for (let i = 0; i < 200; i++) { clock += 1000 / 30; advanceFrame(clock); }
assert.equal(field.replaySnapshot, null, 'replay dissolve releases its snapshot after completion');
assert.ok(field.time > DEFAULTS.replayFadeSeconds, 'background clock continues after replay dissolve');

field.destroy();
assert.equal(callbacks.size, 0); assert.equal(field.destroyed, true);
document.hidden = true;
const hiddenField = new AsciiField(canvas);
assert.equal(callbacks.size, 0, 'a page loaded hidden does not schedule animation');
document.hidden = false; listeners.visibilitychange();
assert.equal(callbacks.size, 1, 'a page loaded hidden starts when made visible');
hiddenField.destroy(); assert.equal(callbacks.size, 0);
console.log('PASS: perceptible background flow after reveal; .01 frame-opacity bound; 42s reveal; continuous glyph crossfades; pause/offscreen/visibility clocks; dissolve replay; reduced-motion stillness; geometry and cleanup.');
