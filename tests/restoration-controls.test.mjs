import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import * as renderer from '../renderer.js';

const baselineCommit = '192cd7374e791883865bf88a65d50c3010104ad8';
const baselineBytes = execFileSync('git', ['show', `${baselineCommit}:renderer.js`], { cwd: fileURLToPath(new URL('..', import.meta.url)), maxBuffer: 1024 * 1024 });
const baselineSha256 = createHash('sha256').update(baselineBytes).digest('hex');
const baselineArtifact = join(tmpdir(), `vector-index-renderer-${baselineCommit}.mjs`);
writeFileSync(baselineArtifact, baselineBytes);
const baseline = await import(`data:text/javascript;base64,${baselineBytes.toString('base64')}`);

function createHarness(module, width, height, options = {}) {
  let draws = [], font = '', rafId = 0;
  const callbacks = new Map(), listeners = {};
  globalThis.requestAnimationFrame = callback => { callbacks.set(++rafId, callback); return rafId; };
  globalThis.cancelAnimationFrame = id => callbacks.delete(id);
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.document = {
    hidden: false, addEventListener(name, callback) { listeners[name] = callback; }, removeEventListener() {},
    createElement() { return { getContext() { return { drawImage() {} }; } }; }
  };
  const context = {
    setTransform() {}, drawImage() {},
    fillRect(x, y, w, h) { draws = [{ op: 'fill', x, y, width: w, height: h, alpha: this.globalAlpha, color: this.fillStyle }]; },
    set font(value) { font = value; }, get font() { return font; },
    fillText(char, x, y) { draws.push({ op: 'text', char, x, y, alpha: this.globalAlpha, color: this.fillStyle, font, align: this.textAlign, baseline: this.textBaseline }); }
  };
  const canvas = { getContext: () => context, getBoundingClientRect: () => ({ width, height, left: 0, top: 0 }), parentElement: { addEventListener() {}, removeEventListener() {} } };
  const field = new module.AsciiField(canvas, options);
  return { field, callbacks, listeners,
    capture(seconds) { if (seconds !== undefined) field.time = seconds; field.render(); return draws; },
    tick(now) { const id = field.raf, callback = callbacks.get(id); assert.equal(typeof callback, 'function'); callbacks.delete(id); callback(now); }
  };
}


const legacyDuration = baseline.DEFAULTS.revealDelay + baseline.DEFAULTS.wanderSeconds + baseline.DEFAULTS.revealSeconds;
const flowCalibration = legacyDuration / 45;
const wallAtLegacy = seconds => seconds * 45 / legacyDuration;
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-10, message);
function equalClocks(a, b) {
  for (const key of ['wallSeconds', 'flowSeconds', 'totalProgress', 'sequenceSeconds', 'formationProgress']) close(a[key], b[key], key + ' remains continuous');
}
function equalFrame(a, b) {
  assert.equal(a.length, b.length, 'historical draw ordering and command count remain intact');
  let maximumPositionDelta = 0, maximumAlphaDelta = 0;
  for (let id = 0; id < a.length; id++) {
    for (const key of ['op', 'char', 'font', 'color', 'align', 'baseline', 'width', 'height']) assert.equal(a[id][key], b[id][key]);
    const position = Math.max(Math.abs(a[id].x - b[id].x), Math.abs(a[id].y - b[id].y)), alpha = Math.abs(a[id].alpha - b[id].alpha);
    maximumPositionDelta = Math.max(maximumPositionDelta, position); maximumAlphaDelta = Math.max(maximumAlphaDelta, alpha);
    // Multiplication/division through the affine time conversion can differ by
    // a few IEEE754 ulps. These tolerances are far below a raster pixel or an
    // alpha code value; glyphs, paint, fonts and ordering are compared exactly.
    assert.ok(position < 1e-9, 'actual glyph geometry matches the historical curve');
    assert.ok(alpha < 1e-12, 'actual glyph paint matches the historical shader');
  }
  return { maximumPositionDelta, maximumAlphaDelta };
}
function titleGroups(field, commands) {
  const calls = commands.filter(call => call.baseline === 'top'); let cursor = 0;
  const groups = field.title.map(point => { const group = calls.slice(cursor, cursor + 2 + (point.n > .92 ? 1 : 0)); cursor += group.length; return group; });
  assert.equal(cursor, calls.length); return groups;
}
function exactReadable(field, commands) {
  return titleGroups(field, commands).filter((group, id) => group[0].x === field.title[id].x && group[0].y === field.title[id].y && group[1].x === field.title[id].x && group[1].y === field.title[id].y && Math.max(group[0].alpha, group[1].alpha) >= .8).length / field.title.length;
}

test('default45-second paint is the historical192cd renderer reparameterized through its canonical clock', () => {
  const times = [0, .3, .9, 1.8, 4, 10, 19.8 - 1 / 30, 19.8, 40, 60, 80, 100, 115.8 - 1 / 30, 115.8, 132, 134, 137, 560];
  const observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    const actual = createHarness(renderer, width, height), expected = createHarness(baseline, width, height);
    const viewport = { width, height, cell: actual.field.cell, row: actual.field.row, fontSize: actual.field.titleFont };
    assert.equal(actual.field.totalDuration, 45); assert.equal(actual.field.options.revealSeconds, 96);
    let checkedCommands = 0, maximumPositionDelta = 0, maximumAlphaDelta = 0;
    for (const time of times) {
      for (const name of ['timingAt', 'glyphStateAt', 'particlePoseAt', 'fieldPoseAt']) {
        const args = name === 'timingAt' ? [time] : name === 'glyphStateAt' ? [17, 31, time] : name === 'fieldPoseAt' ? [17, 31, viewport, time] : [137, actual.field.title[137], viewport, time];
        assert.deepEqual(renderer[name](...args), baseline[name](...args), 'standalone helper formulas remain exactly historical');
      }
      const commands = actual.capture(wallAtLegacy(time)), oldCommands = expected.capture(time), delta = equalFrame(commands, oldCommands);
      checkedCommands += oldCommands.length; maximumPositionDelta = Math.max(maximumPositionDelta, delta.maximumPositionDelta); maximumAlphaDelta = Math.max(maximumAlphaDelta, delta.maximumAlphaDelta);
    }
    observations.push({ width, height, checkedCommands, maximumPositionDelta, maximumAlphaDelta }); actual.field.destroy(); expected.field.destroy();
  }
  console.log('Total-time historical parity: ' + JSON.stringify({ baselineCommit, baselineSha256, baselineArtifact, observations }));
});

test('selected30,45,60-second totals include the opening and complete starts and replays independently of flow speed', () => {
  const observations = [], openingRatio = (baseline.DEFAULTS.revealDelay + baseline.DEFAULTS.wanderSeconds) / legacyDuration;
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) for (const duration of [30, 45, 60]) for (const speed of [.25, 1, 2]) {
    const harness = createHarness(renderer, width, height, { totalDuration: duration, flowSpeed: speed }), { field } = harness;
    assert.equal(field.totalDuration, duration); assert.equal(field.formationDuration, duration);
    field.time = duration * openingRatio - .001; assert.equal(field.formationProgress, 0);
    field.time = duration * openingRatio + .001; assert.ok(field.formationProgress > 0, 'the canonical opening boundary scales with the whole chosen duration');
    field.time = duration - .001; assert.ok(field.totalProgress < 1 && field.formationProgress < 1, 'completion does not happen prematurely');
    const states = [];
    for (const replay of [false, true]) {
      if (replay) field.replay(); field.replaySnapshot = null;
      field.time = duration; const state = field.getFrameState(), commands = harness.capture(), readable = exactReadable(field, commands);
      assert.equal(state.totalProgress, 1); assert.equal(state.formationProgress, 1); assert.equal(readable, 1);
      close(state.sequenceSeconds, legacyDuration, 'the total deadline reaches the exact canonical sequence end');
      states.push({ replay, totalProgress: state.totalProgress, formationProgress: state.formationProgress, exactReadableFraction: readable });
    }
    observations.push({ width, height, duration, speed, openingSeconds: duration * openingRatio, states }); field.destroy();
  }
  console.log('Total-time completion/intro matrix: ' + JSON.stringify(observations));
});

test('total and flow changes preserve the full sequence phase and actual frame before, during and after assembly', () => {
  const observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) for (const time of [.2, 2, 10, 30, 50]) {
    const harness = createHarness(renderer, width, height), { field } = harness;
    field.time = time; harness.tick(1000);
    for (const [speed, duration] of [[.25, 30], [2, 60], [.25, 60], [2, 30], [1, 45]]) {
      const before = field.getFrameState(), commands = harness.capture(), pending = field.raf, previousTick = field.previous;
      assert.equal(field.setFlowSpeed(speed), speed); equalClocks(field.getFrameState(), before); equalFrame(harness.capture(), commands);
      assert.equal(field.setFormationDuration(duration), duration); equalClocks(field.getFrameState(), before); equalFrame(harness.capture(), commands);
      assert.equal(field.raf, pending); assert.equal(field.previous, previousTick); assert.equal(harness.callbacks.size, 1);
    }
    field.setFlowSpeed(2); field.setTotalDuration(30); const before = field.getFrameState(); harness.tick(1050); const after = field.getFrameState();
    close(after.totalProgress, Math.min(1, before.totalProgress + .05 / 30), 'only the remaining total sequence pace changes');
    close(after.flowSeconds - before.flowSeconds, .05 * 2 * flowCalibration, 'ambient flow keeps its fixed45-second calibration');
    close(after.formationProgress, baseline.timingAt(after.sequenceSeconds).progress, 'letter progress follows canonical phase rather than ambient flow');
    const calls = harness.capture().filter(call => call.baseline === 'middle'), points = [];
    for (const call of calls) if (!points.length || call.x !== points.at(-1).x || call.y !== points.at(-1).y) points.push(call);
    const cols = Math.ceil(width / field.cell); assert.equal(points.length, cols * Math.ceil(height / field.row));
    for (const id of [0, Math.floor(points.length / 3), Math.floor(points.length * 2 / 3), points.length - 1]) {
      const expected = baseline.fieldPoseAt(id % cols, Math.floor(id / cols), { width, height, cell: field.cell, row: field.row }, after.flowSeconds);
      close(points[id].x, expected.x, 'actual native flow uses the integrated historical curve'); close(points[id].y, expected.y, 'actual native flow uses the integrated historical curve');
    }
    observations.push({ width, height, time, before, after }); field.destroy();
  }
  console.log('Total-time independent clocks and continuity: ' + JSON.stringify(observations));
});

test('total-time replay and pause/hidden/offscreen/reduced states preserve selected settings and frozen clocks', () => {
  const observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    const harness = createHarness(renderer, width, height, { totalDuration: 60 }), { field } = harness;
    field.time = 20; harness.tick(1000); let now = 1000;
    const modes = [
      ['pause', () => field.setPaused(true), () => field.setPaused(false)],
      ['hidden', () => { document.hidden = true; harness.listeners.visibilitychange(); }, () => { document.hidden = false; harness.listeners.visibilitychange(); }],
      ['offscreen', () => { field.inView = false; field.schedule(); }, () => { field.inView = true; field.schedule(); }],
      ['reduced', () => field.setReduced(true), () => field.setReduced(false)]
    ];
    for (const [mode, stop, resume] of modes) {
      stop(); const before = field.getFrameState(), commands = harness.capture();
      field.setFlowSpeed(.25); field.setFormationDuration(30); equalClocks(field.getFrameState(), before); equalFrame(harness.capture(), commands);
      assert.equal(harness.callbacks.size, 0, mode + ' stays frozen after settings change');
      field.tick(now + 5000); equalClocks(field.getFrameState(), before);
      if (mode === 'reduced') { field.replay(); equalClocks(field.getFrameState(), before); equalFrame(harness.capture(), commands); }
      resume(); now += 6000; harness.tick(now); equalClocks(field.getFrameState(), before);
      now += 50; harness.tick(now); close(field.getFrameState().flowSeconds - before.flowSeconds, .05 * .25 * flowCalibration, mode + ' resumes without catch-up');
    }
    field.setPaused(true); field.replay(); const reset = field.getFrameState();
    assert.equal(reset.wallSeconds, 0); assert.equal(reset.flowSeconds, 0); assert.equal(reset.totalProgress, 0); assert.equal(reset.sequenceSeconds, 0); assert.equal(reset.formationProgress, 0);
    assert.equal(field.flowOffset, 0); assert.equal(field.sequenceOffset, 0); assert.equal(field.totalDuration, 30); assert.equal(field.flowSpeed, .25); assert.equal(field.paused, false); assert.ok(field.replaySnapshot);
    const restarted = harness.capture(); field.replaySnapshot = null;
    field.setFormationDuration(60); assert.equal(field.totalDuration, 60); field.time = 60; assert.equal(exactReadable(field, harness.capture()), 1);
    field.setReduced(true); const still = harness.capture(); field.setFormationDuration(30); field.setFlowSpeed(2); equalFrame(harness.capture(), still);
    const frozen = field.getFrameState(); field.tick(now + 5000); field.replay(); equalClocks(field.getFrameState(), frozen); assert.equal(harness.callbacks.size, 0);
    field.time = 1000; equalFrame(harness.capture(), still);
    const historical = createHarness(baseline, width, height); assert.deepEqual(restarted, historical.capture(0));
    historical.field.setReduced(true); assert.deepEqual(still, historical.capture(1000), 'reduced motion keeps the canonical historical completed still');
    observations.push({ width, height, replayTotal: 30, replaySpeed: .25, modes: modes.map(([name]) => name) }); field.destroy(); historical.field.destroy();
  }
  console.log('Total-time lifecycle and replay: ' + JSON.stringify(observations));
});

test('class total timing keeps canonical ratios despite legacy option conflicts and clamps30..60', () => {
  const legacyOptions = { revealDelay: 10, wanderSeconds: 50, revealSeconds: 200 };
  const custom = createHarness(renderer, 390, 844, { totalDuration: 30, ...legacyOptions });
  custom.field.time = 30; const deadline = custom.field.getFrameState(); assert.equal(deadline.formationProgress, 1);
  assert.equal(custom.field.options.revealDelay, baseline.DEFAULTS.revealDelay); assert.equal(custom.field.options.wanderSeconds, baseline.DEFAULTS.wanderSeconds); assert.equal(custom.field.options.revealSeconds, baseline.DEFAULTS.revealSeconds);
  custom.field.setTotalDuration(1); assert.equal(custom.field.totalDuration, 30); custom.field.setTotalDuration(200); assert.equal(custom.field.totalDuration, 60); custom.field.destroy();
  const openingCustom = createHarness(renderer, 390, 844, { totalDuration: 45, ...legacyOptions }), commands = openingCustom.capture(.35); openingCustom.field.destroy();
  const normal = createHarness(renderer, 390, 844); equalFrame(commands, normal.capture(.35)); normal.field.destroy();
  const helperOptions = { ...baseline.DEFAULTS, ...legacyOptions }; assert.deepEqual(renderer.timingAt(100, helperOptions), baseline.timingAt(100, helperOptions));
  console.log('Total-time canonical class options: ' + JSON.stringify({ deadline, openingMatchesCanonical: true }));
});

function opacityMap(commands) {
  const alpha = new Map(); let backgroundId = -1, previous = null, titleId = 0;
  for (const command of commands) {
    if (command.op !== 'text') continue; let key;
    if (command.baseline === 'middle') { if (!previous || command.x !== previous.x || command.y !== previous.y) backgroundId++; previous = command; key = 'background|' + backgroundId + '|' + command.char; }
    else key = 'title|' + titleId++ + '|' + command.char;
    alpha.set(key, (alpha.get(key) || 0) + command.alpha);
  }
  return alpha;
}
function maximumAlphaDifference(a, b) {
  const left = opacityMap(a), right = opacityMap(b); let maximum = 0;
  for (const key of new Set([...left.keys(), ...right.keys()])) maximum = Math.max(maximum, Math.abs((left.get(key) || 0) - (right.get(key) || 0)));
  return maximum;
}
test('both canonical clocks retain strict opacity continuity while compressed wall-frame derivatives are reported honestly', () => {
  const observations = [], canonicalStep = 1 / 30;
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) for (const duration of [30, 45, 60]) for (const speed of [.25, 1, 2]) {
    const harness = createHarness(renderer, width, height, { totalDuration: duration, flowSpeed: speed }), { field } = harness;
    const sequenceRate = legacyDuration / duration, ambientRate = flowCalibration * speed, wallStep = canonicalStep / Math.max(sequenceRate, ambientRate);
    let maximumCanonicalStepAlpha = 0, maximumWallFrameAlpha = 0;
    for (const fraction of [.005, .5, 1.1]) {
      const wall = duration * fraction, before = harness.capture(wall), state = field.getFrameState(), canonical = harness.capture(wall + wallStep), after = field.getFrameState();
      assert.ok(after.flowSeconds - state.flowSeconds <= canonicalStep + 1e-10 && after.sequenceSeconds - state.sequenceSeconds <= canonicalStep + 1e-10, 'neither canonical clock advances more than its unchanged1/30s step');
      maximumCanonicalStepAlpha = Math.max(maximumCanonicalStepAlpha, maximumAlphaDifference(before, canonical));
      assert.ok(maximumCanonicalStepAlpha < .01, 'the unchanged historical shader/intro retains the strict canonical-step opacity limit');
      maximumWallFrameAlpha = Math.max(maximumWallFrameAlpha, maximumAlphaDifference(before, harness.capture(wall + 1 / 30)));
    }
    observations.push({ width, height, duration, speed, sequenceRate, ambientRate, maximumCanonicalStepAlpha, maximumWallFrameAlpha }); field.destroy();
  }
  console.log('Total-time canonical/wall opacity: ' + JSON.stringify(observations));
});
