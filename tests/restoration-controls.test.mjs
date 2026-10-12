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

test('default helper trajectories and actual paint/glyph commands exactly match renderer commit 192cd', () => {
  const times = [0, 4, 10, 19.8 - 1 / 30, 19.8, 40, 60, 80, 100, 115.8 - 1 / 30, 115.8, 132, 134, 137, 560];
  const differences = [], observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    const actual = createHarness(renderer, width, height), expected = createHarness(baseline, width, height);
    const viewport = { width, height, cell: actual.field.cell, row: actual.field.row, fontSize: actual.field.titleFont };
    let helperDifferences = 0, frameDifferences = 0, checkedCommands = 0;
    for (const time of times) {
      for (const name of ['timingAt', 'glyphStateAt', 'particlePoseAt', 'fieldPoseAt']) {
        const args = name === 'timingAt' ? [time] : name === 'glyphStateAt' ? [17, 31, time] : name === 'fieldPoseAt' ? [17, 31, viewport, time] : [137, actual.field.title[137], viewport, time];
        const value = renderer[name](...args), oldValue = baseline[name](...args);
        if (!isDeepStrictEqual(value, oldValue)) {
          helperDifferences++;
          if (!differences.some(item => item.kind === 'helper')) differences.push({ kind: 'helper', width, height, time, name, actual: value, baseline: oldValue });
        }
      }
      const commands = actual.capture(time), oldCommands = expected.capture(time); checkedCommands += oldCommands.length;
      if (!isDeepStrictEqual(commands, oldCommands)) {
        frameDifferences++;
        if (!differences.some(item => item.kind === 'native-draw')) {
          const index = oldCommands.findIndex((command, id) => !isDeepStrictEqual(command, commands[id]));
          differences.push({ kind: 'native-draw', width, height, time, actualCount: commands.length, baselineCount: oldCommands.length, firstDifferenceIndex: index, actual: commands[index], baseline: oldCommands[index] });
        }
      }
    }
    observations.push({ width, height, helperDifferences, frameDifferences, checkedCommands }); actual.field.destroy(); expected.field.destroy();
  }
  console.log('Exact historical renderer parity: ' + JSON.stringify({ baselineCommit, baselineSha256, baselineArtifact, observations, firstDifferences: differences }));
  assert.deepEqual(differences, [], 'default physical trajectories, glyphs, alpha, fonts, palette and paint commands must match the Git object, not a generated snapshot');
});

function equalClocks(a, b) {
  for (const key of ['wallSeconds', 'flowSeconds', 'formationProgress']) assert.ok(Math.abs(a[key] - b[key]) < 1e-10, `${key} remains continuous`);
}
function equalFrame(a, b) {
  assert.equal(a.length, b.length);
  for (let id = 0; id < a.length; id++) {
    for (const key of ['op', 'char', 'font', 'color', 'align', 'baseline', 'width', 'height']) assert.equal(a[id][key], b[id][key]);
    assert.ok(Math.abs(a[id].x - b[id].x) < 1e-9 && Math.abs(a[id].y - b[id].y) < 1e-9, 'settings never jump actual glyph positions');
    assert.ok(Math.abs(a[id].alpha - b[id].alpha) < 1e-12, 'settings never jump actual glyph paint');
  }
}

test('independent speed and duration controls preserve actual frames and change only subsequent clock rates', () => {
  const observations = [], intro = baseline.DEFAULTS.revealDelay + baseline.DEFAULTS.wanderSeconds;
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    for (const time of [4, 30, 80, 120]) {
      const harness = createHarness(renderer, width, height), { field } = harness;
      field.time = time; harness.tick(1000);
      for (const [speed, duration] of [[.25, 45], [2, 180], [.25, 180], [2, 45], [1, 96]]) {
        const before = field.getFrameState(), frame = harness.capture(), pending = field.raf, previous = field.previous;
        assert.equal(field.setFlowSpeed(speed), speed); equalClocks(field.getFrameState(), before); equalFrame(harness.capture(), frame);
        assert.equal(field.setFormationDuration(duration), duration); equalClocks(field.getFrameState(), before); equalFrame(harness.capture(), frame);
        assert.equal(field.raf, pending); assert.equal(field.previous, previous); assert.equal(harness.callbacks.size, 1, 'settings do not restart scheduling');
      }
      // Leave each field at the opposite control extremes to verify actual RAF
      // and baseline local curves consume independent integrated clocks.
      field.setFlowSpeed(2); field.setFormationDuration(45);
      const before = field.getFrameState(); harness.tick(1050); const after = field.getFrameState();
      assert.ok(Math.abs(after.flowSeconds - before.flowSeconds - .1) < 1e-10);
      const expectedProgress = time < intro ? 0 : Math.min(1, before.formationProgress + .05 / 45);
      assert.ok(Math.abs(after.formationProgress - expectedProgress) < 1e-10, 'speed does not alter the remaining formation pace');
      const calls = harness.capture().filter(call => call.baseline === 'middle'), points = [];
      for (const call of calls) if (!points.length || call.x !== points.at(-1).x || call.y !== points.at(-1).y) points.push(call);
      const cols = Math.ceil(width / field.cell);
      assert.equal(points.length, cols * Math.ceil(height / field.row));
      for (const id of [0, Math.floor(points.length / 3), Math.floor(points.length * 2 / 3), points.length - 1]) {
        const expected = baseline.fieldPoseAt(id % cols, Math.floor(id / cols), { width, height, cell: field.cell, row: field.row }, after.flowSeconds);
        assert.equal(points[id].x, expected.x); assert.equal(points[id].y, expected.y, 'native wandering uses the historical curve at the integrated phase');
      }
      if (time === 4) { field.time = intro - .001; assert.equal(field.formationProgress, 0, 'pre-start duration input preserves the initial19.8s gate'); }
      if (time === 120) assert.equal(after.formationProgress, 1, 'duration changes do not reopen a completed wordmark');
      observations.push({ width, height, time, before, after }); field.destroy();
    }
  }
  console.log('Restored independent control clocks: ' + JSON.stringify(observations));
});

test('restored controls preserve pause/hidden/offscreen/reduced clocks and replay settings with exact final targets', () => {
  const observations = [], intro = baseline.DEFAULTS.revealDelay + baseline.DEFAULTS.wanderSeconds;
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    const harness = createHarness(renderer, width, height), { field } = harness;
    field.time = 80; field.setFlowSpeed(.25); field.setFormationDuration(45); harness.tick(1000);
    const modes = [
      ['pause', () => field.setPaused(true), () => field.setPaused(false)],
      ['hidden', () => { document.hidden = true; harness.listeners.visibilitychange(); }, () => { document.hidden = false; harness.listeners.visibilitychange(); }],
      ['offscreen', () => { field.inView = false; field.schedule(); }, () => { field.inView = true; field.schedule(); }],
      ['reduced', () => field.setReduced(true), () => field.setReduced(false)]
    ];
    let now = 1000;
    for (const [mode, stop, resume] of modes) {
      stop(); const before = field.getFrameState(), frame = harness.capture();
      field.setFlowSpeed(2); field.setFormationDuration(180);
      equalClocks(field.getFrameState(), before); equalFrame(harness.capture(), frame);
      assert.equal(harness.callbacks.size, 0, `${mode} settings cannot start animation`);
      field.tick(now + 5000); equalClocks(field.getFrameState(), before);
      if (mode === 'reduced') { field.replay(); equalClocks(field.getFrameState(), before); equalFrame(harness.capture(), frame); }
      resume(); now += 6000; harness.tick(now); equalClocks(field.getFrameState(), before);
      now += 50; harness.tick(now);
      assert.ok(Math.abs(field.flowTime - before.flowSeconds - .1) < 1e-10, `${mode} resumes at the selected speed without catch-up`);
    }
    field.setFlowSpeed(.25); field.setFormationDuration(45); field.setPaused(true); field.replay();
    assert.equal(field.time, 0); assert.equal(field.flowTime, 0); assert.equal(field.formationProgress, 0);
    assert.equal(field.flowOffset, 0); assert.equal(field.formationOffset, 0); assert.equal(field.paused, false);
    assert.equal(field.flowSpeed, .25); assert.equal(field.formationDuration, 45); assert.ok(field.replaySnapshot);
    const restarted = harness.capture(); field.replaySnapshot = null;
    for (const duration of [45, 180]) {
      field.time = 0; field.setFormationDuration(duration);
      field.time = intro + duration; const state = field.getFrameState(), calls = harness.capture().filter(call => call.baseline === 'top');
      assert.equal(state.formationProgress, 1, 'each selected full-cycle duration reaches completion at its own deadline');
      let cursor = 0;
      for (const point of field.title) {
        const group = calls.slice(cursor, cursor + 2 + (point.n > .92 ? 1 : 0)); cursor += group.length;
        assert.equal(group[0].x, point.x); assert.equal(group[0].y, point.y);
        assert.equal(group[1].x, point.x); assert.equal(group[1].y, point.y);
        assert.ok(Math.max(group[0].alpha, group[1].alpha) >= .8, 'completed letters retain their original readable opacity');
      }
      assert.equal(cursor, calls.length);
    }
    field.setReduced(true); const still = harness.capture();
    field.setFlowSpeed(2); field.setFormationDuration(45); equalFrame(harness.capture(), still);
    field.time = 1000; equalFrame(harness.capture(), still); assert.equal(harness.callbacks.size, 0);
    const historical = createHarness(baseline, width, height);
    assert.deepEqual(restarted, historical.capture(0), 'selected settings replay from the exact historical opening frame');
    historical.field.setReduced(true); assert.deepEqual(still, historical.capture(1000), 'reduced settings retain the exact historical completed still frame');
    observations.push({ width, height, replaySpeed: .25, replayDuration: 45, checkedModes: modes.map(([mode]) => mode), completedDurations: [45, 180] });
    field.destroy(); historical.field.destroy();
  }
  console.log('Restored lifecycle/replay/final targets: ' + JSON.stringify(observations));
});

function opacityMap(commands) {
  const alpha = new Map(); let backgroundId = -1, previous = null, titleId = 0;
  for (const command of commands) {
    if (command.op !== 'text') continue;
    let key;
    if (command.baseline === 'middle') {
      if (!previous || command.x !== previous.x || command.y !== previous.y) backgroundId++;
      previous = command; key = `background|${backgroundId}|${command.char}`;
    } else key = `title|${titleId++}|${command.char}`;
    alpha.set(key, (alpha.get(key) || 0) + command.alpha);
  }
  return alpha;
}
function maximumAlphaDifference(a, b) {
  const left = opacityMap(a), right = opacityMap(b); let maximum = 0;
  for (const key of new Set([...left.keys(), ...right.keys()])) maximum = Math.max(maximum, Math.abs((left.get(key) || 0) - (right.get(key) || 0)));
  return maximum;
}

test('controlled shader clocks preserve historical paint and the strict default opacity bound per animation-phase step', () => {
  const observations = [], dt = 1 / 30;
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    for (const phase of [132, 137]) for (const speed of [.25, 1, 2]) {
      const harness = createHarness(renderer, width, height), { field } = harness;
      field.time = phase; field.setFlowSpeed(speed); field.setFormationDuration(180); harness.tick(1000);
      const before = field.getFrameState(), beforeCommands = harness.capture();
      const phaseStepCommands = harness.capture(before.wallSeconds + dt / speed);
      const phaseStepAlpha = maximumAlphaDifference(beforeCommands, phaseStepCommands);
      assert.ok(phaseStepAlpha < .01, 'the unchanged historical shader retains its strict1/30s animation-phase opacity limit at every speed');
      field.time = before.wallSeconds; harness.tick(1000 + 1000 / 30);
      const after = field.getFrameState(), afterCommands = harness.capture(), rawWallFrameAlpha = maximumAlphaDifference(beforeCommands, afterCommands);
      assert.ok(Math.abs(after.flowSeconds - before.flowSeconds - speed * dt) < 1e-10);
      if (speed === 1) assert.ok(rawWallFrameAlpha < .01, 'the original1x wall-frame no-flicker bound is unchanged');
      const reference = createHarness(baseline, width, height);
      assert.deepEqual(beforeCommands, reference.capture(before.flowSeconds));
      assert.deepEqual(afterCommands, reference.capture(after.flowSeconds), 'configured shader paint equals the Git baseline at the exact integrated phase');
      // Faster playback consumes more historical animation time per wall frame.
      // Record its actual derivative; do not retune the requested shader or
      // misreport the original1x absolute bound as valid at every multiplier.
      observations.push({ width, height, phase, speed, phaseStepAlpha, rawWallFrameAlpha, exceedsDefaultWallFrameBound: rawWallFrameAlpha >= .01 });
      field.destroy(); reference.field.destroy();
    }
  }
  console.log('Restored phase-clock opacity characterization: ' + JSON.stringify(observations));
});
