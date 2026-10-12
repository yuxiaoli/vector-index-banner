import assert from 'node:assert/strict';
import test from 'node:test';
import * as renderer from '../renderer.js';

test('initial particle positions are target-independent and dispersed across the field', () => {
  const observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    const viewport = { width, height, fontSize: 10 }, bins = new Set(), points = [];
    const a = { x: width * .2, y: height * .3 }, b = { x: width * .8, y: height * .7 };
    for (let id = 0; id < 256; id++) {
      const point = renderer.particlePoseAt(id, a, viewport, 10);
      assert.deepEqual(renderer.particlePoseAt(id, b, viewport, 10), point, 'changing the future letter target does not reshape the initial flow');
      assert.deepEqual(renderer.particlePoseAt(id, a, viewport, 10), point, 'initial disorder is deterministic rather than frame-wise noise');
      assert.equal(point.settle, 0);
      points.push(point); bins.add(`${Math.floor(point.x / width * 8)}|${Math.floor(point.y / height * 6)}`);
    }
    const xs = points.map(point => point.x), ys = points.map(point => point.y);
    const observation = { width, height, occupiedFraction: bins.size / 48, spanX: (Math.max(...xs) - Math.min(...xs)) / width, spanY: (Math.max(...ys) - Math.min(...ys)) / height };
    observations.push(observation);
    assert.ok(observation.occupiedFraction >= .35, 'initial glyphs occupy a broad two-dimensional region rather than a transformed wordmark');
    assert.ok(observation.spanX >= .55 && observation.spanY >= .5, 'initial disorder spreads over both field axes');
  }
  console.log('Target-independent initial distribution: ' + JSON.stringify(observations));
});

test('the actual moving cloud organizes toward the wordmark rather than only fading a fixed silhouette', () => {
  let dimensions = { width: 1440, height: 900 }, draws = [], fontStage = 0;
  globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const context = {
    setTransform() {}, fillRect() { draws = []; fontStage = 0; },
    set font(value) { this.fontValue = value; fontStage++; }, get font() { return this.fontValue; },
    fillText(char, x, y) { if (fontStage === 2) draws.push({ x, y, alpha: this.globalAlpha }); }
  };
  const canvas = { getContext: () => context, getBoundingClientRect: () => ({ ...dimensions, left: 0, top: 0 }), parentElement: { addEventListener() {}, removeEventListener() {} } };
  const end = renderer.DEFAULTS.revealDelay + renderer.DEFAULTS.wanderSeconds + renderer.DEFAULTS.revealSeconds;
  const observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    dimensions = { width, height }; const field = new renderer.AsciiField(canvas);
    const viewport = { width, height, fontSize: field.titleFont }, ax = width / 2, ay = Math.min(field.cy, height - field.cy);
    const errors = [10, 80, 100, end - .5].map(time => {
      field.time = time; field.render();
      let cursor = 0, distance = 0;
      for (const target of field.title) {
        const moving = draws[cursor], goal = renderer.flowPoseAt(target, viewport, time);
        distance += Math.hypot((moving.x - goal.x) / ax, (moving.y - goal.y) / ay);
        cursor += 4 + (target.n > .92 ? 1 : 0);
      }
      assert.equal(cursor, draws.length, 'moving and stationary layers retain stable particle identity');
      return distance / field.title.length;
    });
    observations.push({ width, height, normalizedGoalErrors: errors }); field.destroy();
  }
  console.log('Actual moving-cloud organization: ' + JSON.stringify(observations));
  for (const observation of observations) {
    const [early, middle, late, final] = observation.normalizedGoalErrors;
    assert.ok(early >= .4, 'the initial cloud is not a hidden transformed wordmark');
    assert.ok(middle <= early * .85, 'moving particles gain spatial constraints during organization');
    assert.ok(late <= middle * .7, 'moving particles approach their corresponding organized streamlines');
    assert.ok(final <= early * .04, 'late moving geometry approaches the wordmark independently of mask opacity');
  }
});

test('changing flow speed preserves actual positions and formation while only changing subsequent phase rate', () => {
  let draws = [], fontStage = 0, rafId = 0;
  const callbacks = new Map();
  globalThis.requestAnimationFrame = callback => { callbacks.set(++rafId, callback); return rafId; };
  globalThis.cancelAnimationFrame = id => callbacks.delete(id);
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const context = {
    setTransform() {}, fillRect() { draws = []; fontStage = 0; },
    set font(value) { fontStage++; },
    fillText(char, x, y) { draws.push({ char, x, y, alpha: this.globalAlpha, layer: fontStage }); }
  };
  const canvas = { getContext: () => context, getBoundingClientRect: () => ({ width: 390, height: 844, left: 0, top: 0 }), parentElement: { addEventListener() {}, removeEventListener() {} } };
  const field = new renderer.AsciiField(canvas);
  const tick = now => { const id = field.raf, callback = callbacks.get(id); assert.equal(typeof callback, 'function'); callbacks.delete(id); callback(now); };
  field.time = 60; field.render(); tick(1000);
  assert.equal(typeof field.setFlowSpeed, 'function', 'the renderer exposes a phase-preserving speed control');
  assert.equal(typeof field.getFrameState, 'function', 'clock state can be checked independently of animation poses');
  const before = field.getFrameState(), beforeDraws = structuredClone(draws);
  assert.ok(before.formationProgress > .2 && before.formationProgress < .8, 'the continuity check happens during active organization');
  assert.equal(field.setFlowSpeed(2), 2);
  field.render(); const after = field.getFrameState();
  assert.equal(after.wallSeconds, before.wallSeconds);
  assert.equal(after.flowSeconds, before.flowSeconds, 'changing speed does not jump the integrated flow phase');
  assert.equal(after.formationProgress, before.formationProgress, 'changing speed leaves organization progress independent');
  assert.deepEqual(draws, beforeDraws, 'speed changes preserve every actual glyph pose and opacity immediately');
  tick(1050); field.render(); const advanced = field.getFrameState();
  assert.ok(Math.abs(advanced.flowSeconds - after.flowSeconds - .1) < 1e-9, 'subsequent flow advances at the new multiplier');
  assert.ok(Math.abs(advanced.formationProgress - after.formationProgress - .05 / after.formationDuration) < 1e-9, 'assembly keeps its existing rate');
  assert.ok(draws.some((draw, id) => draw.x !== beforeDraws[id]?.x || draw.y !== beforeDraws[id]?.y), 'the next native frame visibly uses the updated clock');
  console.log('Independent speed clock: ' + JSON.stringify({ before, after, advanced })); field.destroy();
});

function createHarness(width = 390, height = 844, options = {}) {
  let draws = [], fontStage = 0, rafId = 0;
  const callbacks = new Map(), listeners = {};
  globalThis.requestAnimationFrame = callback => { callbacks.set(++rafId, callback); return rafId; };
  globalThis.cancelAnimationFrame = id => callbacks.delete(id);
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.document = {
    hidden: false, addEventListener(name, fn) { listeners[name] = fn; }, removeEventListener() {},
    createElement() { return { getContext() { return { drawImage() {} }; } }; }
  };
  const context = {
    setTransform() {}, drawImage() {}, fillRect() { draws = []; fontStage = 0; },
    set font(value) { fontStage++; },
    fillText(char, x, y) { draws.push({ char, x, y, alpha: this.globalAlpha, layer: fontStage }); }
  };
  const canvas = { getContext: () => context, getBoundingClientRect: () => ({ width, height, left: 0, top: 0 }), parentElement: { addEventListener() {}, removeEventListener() {} } };
  const field = new renderer.AsciiField(canvas, options);
  return {
    field, callbacks, listeners,
    capture() { field.render(); return draws; },
    tick(now) { const id = field.raf, callback = callbacks.get(id); assert.equal(typeof callback, 'function'); callbacks.delete(id); callback(now); }
  };
}

test('duration changes preserve progress and poses, change remaining pace, and retain the initial disorder gate', () => {
  const harness = createHarness(), { field } = harness;
  assert.equal(typeof field.setFormationDuration, 'function', 'the renderer exposes a progress-preserving duration control');
  const intro = renderer.DEFAULTS.revealDelay + renderer.DEFAULTS.wanderSeconds;
  field.time = 4; const earlyDraws = harness.capture();
  assert.equal(field.setFormationDuration(45), 45);
  assert.deepEqual(harness.capture(), earlyDraws, 'a pre-start duration change leaves the initial cloud unchanged');
  for (const time of [4, intro - .01, intro]) { field.time = time; assert.equal(field.getFrameState().formationProgress, 0, 'duration input does not move the initial organization deadline'); }
  field.time = 30; const before = field.getFrameState(), beforeDraws = harness.capture();
  assert.ok(Math.abs(before.formationProgress - (30 - intro) / 45) < 1e-12);
  assert.equal(field.setFormationDuration(180), 180);
  const after = field.getFrameState();
  assert.equal(after.flowSeconds, before.flowSeconds, 'duration leaves the flow phase independent');
  assert.equal(after.formationProgress, before.formationProgress, 'duration retains completed organization work');
  assert.deepEqual(harness.capture(), beforeDraws, 'duration input does not jump actual positions or opacity');
  harness.tick(1000); harness.tick(1050); const advanced = field.getFrameState();
  assert.ok(Math.abs(advanced.flowSeconds - after.flowSeconds - .05) < 1e-9);
  assert.ok(Math.abs(advanced.formationProgress - after.formationProgress - .05 / 180) < 1e-9, 'only the remaining assembly pace changes');
  const remainingSeconds = (1 - advanced.formationProgress) * advanced.formationDuration;
  field.time += remainingSeconds + .01;
  assert.equal(field.getFrameState().formationProgress, 1, 'the new remaining pace reaches completion at its predicted deadline');
  const completed = harness.capture(); field.setFormationDuration(45);
  assert.equal(field.getFrameState().formationProgress, 1, 'changing duration does not reopen a completed formation');
  assert.deepEqual(harness.capture(), completed);
  console.log('Independent duration clock: ' + JSON.stringify({ before, after, advanced, remainingSeconds })); field.destroy();
});

test('replay resets integrated phase and progress offsets while keeping the selected speed and duration', () => {
  const harness = createHarness(), { field } = harness;
  field.time = 80; field.setFlowSpeed(.25); field.setFormationDuration(45);
  assert.notEqual(field.flowOffset, 0); assert.notEqual(field.formationOffset, 0);
  field.setPaused(true); field.replay();
  const restarted = field.getFrameState();
  assert.equal(restarted.wallSeconds, 0);
  assert.equal(restarted.flowSeconds, 0, 'replay returns the integrated vortex phase to its initial cloud');
  assert.equal(restarted.formationProgress, 0, 'replay removes the previous organization work');
  assert.equal(restarted.flowSpeed, .25); assert.equal(restarted.formationDuration, 45);
  assert.equal(field.flowOffset, 0); assert.equal(field.formationOffset, 0);
  assert.equal(field.paused, false); assert.ok(field.replaySnapshot, 'replay retains the existing image for a gentle dissolve');
  const restartedDraws = harness.capture();
  const fresh = createHarness(390, 844, { flowSpeed: .25, formationDuration: 45 });
  assert.deepEqual(restartedDraws, fresh.capture(), 'replay is the same native initial composition as a fresh cycle with the retained settings');
  const title = restartedDraws.filter(draw => draw.layer === 2); let cursor = 0;
  for (const particle of field.title) {
    const group = title.slice(cursor, cursor + 4 + (particle.n > .92 ? 1 : 0)); cursor += group.length;
    assert.equal(group[2].alpha + group[3].alpha, 0, 'the new cycle has no stationary letter mask');
    assert.ok(group[0].alpha + group[1].alpha >= .6, 'the restarted disordered glyphs are visibly bright');
  }
  field.destroy(); fresh.field.destroy();
});

test('the background starts with dispersed target-independent anchors and diffuse ink before organized ribbons emerge', () => {
  const correlation = (a, b) => {
    const meanA = a.reduce((sum, value) => sum + value, 0) / a.length, meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
    let cross = 0, varianceA = 0, varianceB = 0;
    for (let id = 0; id < a.length; id++) { const x = a[id] - meanA, y = b[id] - meanB; cross += x * y; varianceA += x * x; varianceB += y * y; }
    return cross / Math.sqrt(varianceA * varianceB);
  };
  const observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    const viewport = { width, height, cell: 6.1, row: 9.15 }, bins = new Set();
    for (let id = 0; id < 256; id++) {
      const i = id % 16, j = Math.floor(id / 16), initial = renderer.fieldPoseAt(i, j, viewport, 10);
      assert.deepEqual(renderer.fieldPoseAt(i, j, { ...viewport, cell: 10, row: 15 }, 10), initial, 'initial background geometry is independent of its future source-grid target');
      bins.add(`${Math.floor(initial.x / width * 8)}|${Math.floor(initial.y / height * 6)}`);
    }
    assert.ok(bins.size / 48 >= .35, 'early background seeds disperse over the whole flow rather than a rotated lattice');
    const harness = createHarness(width, height), { field } = harness;
    const captureInk = time => {
      field.time = time; const calls = harness.capture().filter(draw => draw.layer === 1), cells = [];
      for (const call of calls) {
        const previous = cells.at(-1);
        if (previous && previous.x === call.x && previous.y === call.y) previous.alpha += call.alpha;
        else cells.push({ x: call.x, y: call.y, alpha: call.alpha });
      }
      assert.equal(cells.length, Math.ceil(width / field.cell) * Math.ceil(height / field.row));
      return cells.map(cell => cell.alpha);
    };
    const early = captureInk(10), organized = captureInk(renderer.DEFAULTS.revealDelay + renderer.DEFAULTS.wanderSeconds + renderer.DEFAULTS.revealSeconds + 16.2);
    const inkCorrelation = correlation(early, organized), meanEarlyAlpha = early.reduce((sum, alpha) => sum + alpha, 0) / early.length;
    assert.ok(Number.isFinite(inkCorrelation) && Math.abs(inkCorrelation) <= .2, 'diffuse early ink does not carry the final ribbon contrast before organization');
    assert.ok(meanEarlyAlpha >= .08, 'initial diffuse glyphs remain visibly bright');
    observations.push({ width, height, occupiedFraction: bins.size / 48, inkCorrelation, meanEarlyAlpha }); field.destroy();
  }
  console.log('Dispersed diffuse background: ' + JSON.stringify(observations));
});

test('neighboring final-target particles gain real shape correlation and stroke spacing before the fixed mask completes', () => {
  const correlation = (a, b) => {
    const meanA = a.reduce((sum, value) => sum + value, 0) / a.length, meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
    let cross = 0, varianceA = 0, varianceB = 0;
    for (let id = 0; id < a.length; id++) { const x = a[id] - meanA, y = b[id] - meanB; cross += x * y; varianceA += x * x; varianceB += y * y; }
    return cross / Math.sqrt(varianceA * varianceB);
  };
  const observations = [], start = renderer.DEFAULTS.revealDelay + renderer.DEFAULTS.wanderSeconds;
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    const harness = createHarness(width, height), { field } = harness, ax = width / 2, ay = Math.min(field.cy, height - field.cy);
    // Ellipse-normalized distances are unchanged by an ordinary common rotation.
    const distance = (a, b) => Math.hypot((a.x - b.x) / ax, (a.y - b.y) / ay);
    const neighbors = field.title.map((point, id) => {
      let best = Infinity, nearest = -1;
      for (let other = 0; other < field.title.length; other++) {
        if (id === other) continue; const gap = distance(point, field.title[other]);
        if (gap < best) { best = gap; nearest = other; }
      }
      return [id, nearest];
    });
    const pairs = Array.from({ length: 2048 }, (_, id) => [id * 37 % field.title.length, (id * 89 + 217) % field.title.length]).filter(([a, b]) => a !== b);
    const targetDistances = pairs.map(([a, b]) => distance(field.title[a], field.title[b]));
    const targetNeighborMean = neighbors.reduce((sum, [a, b]) => sum + distance(field.title[a], field.title[b]), 0) / neighbors.length;
    const frames = [10, 80, 100, start + renderer.DEFAULTS.revealSeconds - .5].map(time => {
      field.time = time; const calls = harness.capture().filter(draw => draw.layer === 2); let cursor = 0;
      const points = field.title.map(point => { const moving = calls[cursor]; cursor += 4 + (point.n > .92 ? 1 : 0); return moving; });
      return { time, pairCorrelation: correlation(targetDistances, pairs.map(([a, b]) => distance(points[a], points[b]))), neighborMean: neighbors.reduce((sum, [a, b]) => sum + distance(points[a], points[b]), 0) / neighbors.length };
    });
    assert.ok(Math.abs(frames[0].pairCorrelation) <= .15, 'initial geometry is not a distorted copy of the final target distances');
    assert.ok(frames[0].neighborMean >= .4, 'future stroke neighbors are initially dispersed over the flow');
    assert.ok(frames[1].pairCorrelation >= .65 && frames[2].pairCorrelation >= .95, 'the moving cloud acquires wordmark geometry before its stationary mask completes');
    assert.ok(frames[1].neighborMean <= frames[0].neighborMean * .6 && frames[2].neighborMean <= frames[1].neighborMean * .3, 'final-target neighbors become spatially coherent during organization');
    assert.ok(frames[3].neighborMean <= targetNeighborMean * 1.5, 'late moving stroke spacing approaches the true final geometry');
    for (const time of [10, start + renderer.DEFAULTS.revealSeconds * .349]) {
      field.time = time; const calls = harness.capture().filter(draw => draw.layer === 2); let cursor = 0;
      for (const point of field.title) { assert.equal(calls[cursor + 2].alpha + calls[cursor + 3].alpha, 0, 'stationary letter masks stay absent before substantial physical organization'); cursor += 4 + (point.n > .92 ? 1 : 0); }
    }
    observations.push({ width, height, targetNeighborMean, frames }); field.destroy();
  }
  console.log('Actual moving shape/neighbor organization: ' + JSON.stringify(observations));
});

test('repeated control switches preserve actual frames and frozen clocks without restarting pause, hidden, offscreen, or reduced states', () => {
  const equalFrame = (a, b) => {
    assert.equal(a.length, b.length);
    for (let id = 0; id < a.length; id++) {
      assert.equal(a[id].char, b[id].char); assert.equal(a[id].layer, b[id].layer);
      assert.ok(Math.abs(a[id].x - b[id].x) < 1e-9 && Math.abs(a[id].y - b[id].y) < 1e-9, 'control switches cannot jump glyph positions');
      assert.ok(Math.abs(a[id].alpha - b[id].alpha) < 1e-12, 'control switches cannot jump glyph opacity');
    }
  };
  const equalClocks = (a, b) => {
    for (const key of ['wallSeconds', 'flowSeconds', 'formationProgress']) assert.ok(Math.abs(a[key] - b[key]) < 1e-10, `${key} is continuous`);
  };
  for (const time of [4, 30, 80, 120]) {
    const harness = createHarness(), { field } = harness;
    field.time = time; harness.tick(1000);
    for (const [speed, duration] of [[.25, 45], [2, 180], [.25, 180], [2, 45], [1, 96]]) {
      const before = field.getFrameState(), frame = harness.capture(), pending = field.raf, previous = field.previous;
      field.setFlowSpeed(speed); field.setFormationDuration(duration);
      equalClocks(field.getFrameState(), before); equalFrame(harness.capture(), frame);
      assert.equal(field.raf, pending); assert.equal(field.previous, previous, 'controls do not reset the RAF delta clock');
      assert.equal(harness.callbacks.size, 1);
    }
    if (time >= 120) assert.equal(field.getFrameState().formationProgress, 1);
    field.destroy();
  }
  const harness = createHarness(), { field } = harness;
  field.time = 80; harness.tick(1000);
  const stopModes = [
    ['pause', () => field.setPaused(true), () => field.setPaused(false)],
    ['hidden', () => { document.hidden = true; harness.listeners.visibilitychange(); }, () => { document.hidden = false; harness.listeners.visibilitychange(); }],
    ['offscreen', () => { field.inView = false; field.schedule(); }, () => { field.inView = true; field.schedule(); }],
    ['reduced', () => field.setReduced(true), () => field.setReduced(false)]
  ];
  let now = 1000;
  for (const [mode, stop, resume] of stopModes) {
    stop(); const before = field.getFrameState(), frame = harness.capture();
    field.setFlowSpeed(.25); field.setFormationDuration(45);
    equalClocks(field.getFrameState(), before); equalFrame(harness.capture(), frame);
    assert.equal(harness.callbacks.size, 0, `${mode} remains frozen after settings changes`);
    field.tick(now + 5000); equalClocks(field.getFrameState(), before);
    if (mode === 'reduced') { field.replay(); equalClocks(field.getFrameState(), before); equalFrame(harness.capture(), frame); }
    resume(); now += 6000; harness.tick(now); equalClocks(field.getFrameState(), before);
    now += 50; harness.tick(now);
    assert.ok(Math.abs(field.getFrameState().flowSeconds - before.flowSeconds - .0125) < 1e-9, `${mode} resumes at the selected speed without catch-up`);
  }
  field.setPaused(true); const before = harness.capture();
  assert.equal(field.setFlowSpeed(100), 2); assert.equal(field.setFlowSpeed(-10), .25);
  assert.equal(field.setFormationDuration(1000), 180); assert.equal(field.setFormationDuration(1), 45);
  equalFrame(harness.capture(), before); assert.equal(harness.callbacks.size, 0);
  field.destroy();
});

test('default and extreme controls retain clockwise bounded motion, brightness, smooth opacity, and exact final letters', () => {
  const dt = 1 / 30, intro = renderer.DEFAULTS.revealDelay + renderer.DEFAULTS.wanderSeconds, observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    for (const [speed, duration] of [[1, 96], [.25, 45], [.25, 180], [2, 45], [2, 180]]) {
      const harness = createHarness(width, height, { flowSpeed: speed, formationDuration: duration }), { field } = harness;
      const ax = width / 2, ay = Math.min(field.cy, height - field.cy), end = intro + duration;
      const viewport = { width, height, cell: field.cell, row: field.row }, cols = Math.ceil(width / field.cell), rows = Math.ceil(height / field.row);
      const normalized = point => ({ x: (point.x - field.cx) / ax, y: (point.y - field.cy) / ay });
      const poseAt = (layer, id, time) => {
        const frame = { ...viewport, flowSeconds: time * speed, formationProgress: Math.max(0, Math.min(1, (time - intro) / duration)) };
        return layer === 'title'
          ? renderer.particlePoseAt(id, field.title[id % field.title.length], frame, time, field.options)
          : renderer.fieldPoseAt((id * 13 + 5) % cols, (id * 17 + 7) % rows, frame, time, field.options);
      };
      let maximumNormalizedVelocity = 0, maximumNormalizedAcceleration = 0, positive = 0, directions = 0;
      for (const layer of ['title', 'background']) for (let sample = 0; sample < 16; sample++) {
        const id = sample * 43;
        for (let frame = 0; frame <= Math.ceil((end + 1) / dt); frame++) {
          const time = frame * dt, points = [0, 1, 2].map(offset => poseAt(layer, id, time + offset * dt));
          for (const point of points) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height, 'all trajectories remain finite and inside the viewport at every frame');
          const [a, b, c] = points.map(normalized), velocity = Math.hypot(b.x - a.x, b.y - a.y) / dt;
          const acceleration = Math.hypot(c.x - 2 * b.x + a.x, c.y - 2 * b.y + a.y) / (dt * dt);
          maximumNormalizedVelocity = Math.max(maximumNormalizedVelocity, velocity); maximumNormalizedAcceleration = Math.max(maximumNormalizedAcceleration, acceleration);
          // At 2x/45s the common angular speed plus one smooth full-turn
          // organization correction is <.42rad/s. The remaining radial pace
          // is <.07/s; .55 ellipse-radii/s leaves bounded physical headroom.
          // Default 120px/s and160px/s2 limits remain in wandering.test.mjs.
          assert.ok(velocity <= .55, `controlled flow remains bounded in ellipse space (${velocity}/s)`);
          assert.ok(acceleration <= .8, `controlled flow has no frame-wise jitter or acceleration spikes (${acceleration}/s2)`);
          if (Math.hypot(a.x, a.y) >= .05) { if (a.x * b.y - a.y * b.x > 0) positive++; directions++; }
        }
      }
      assert.ok(positive / directions >= .98, 'even slow flow with the shortest assembly preserves clockwise direction throughout its curved attraction');
      const capture = time => {
        field.time = time; const calls = harness.capture(), alpha = new Map(), background = [], title = [];
        let backgroundId = -1, previous = null, titleId = 0;
        for (const call of calls) {
          assert.ok(Number.isFinite(call.x) && Number.isFinite(call.y) && call.x >= 0 && call.x <= width && call.y >= 0 && call.y <= height);
          assert.ok(Number.isFinite(call.alpha) && call.alpha >= 0 && call.alpha <= 1);
          if (call.layer === 1) {
            if (!previous || call.x !== previous.x || call.y !== previous.y) { backgroundId++; background.push({ x: call.x, y: call.y, alpha: 0, strongest: 0 }); }
            previous = call; const point = background.at(-1); point.alpha += call.alpha; point.strongest = Math.max(point.strongest, call.alpha);
            const key = `background|${backgroundId}|${call.char}`; alpha.set(key, (alpha.get(key) || 0) + call.alpha);
          } else { alpha.set(`title|${titleId++}|${call.char}`, call.alpha); title.push(call); }
        }
        assert.equal(background.length, cols * rows);
        return { alpha, background, title };
      };
      const checkpoints = [0, .5, 1, 1.8, 10, end + 16.2];
      for (const progress of [.1, .2, .349, .35, .351, .5, .65, .8, .95]) checkpoints.push(intro + duration * progress);
      for (const boundary of [intro, intro + duration * .35, end]) for (const offset of [-2 * dt, -dt, 0, dt, 2 * dt]) checkpoints.push(boundary + offset);
      let maximumFrameAlpha = 0, nativeClockwise = 0, nativeDirections = 0;
      for (const time of checkpoints) {
        const a = capture(time), b = capture(time + dt);
        for (const key of new Set([...a.alpha.keys(), ...b.alpha.keys()])) {
          const delta = Math.abs((a.alpha.get(key) || 0) - (b.alpha.get(key) || 0)); maximumFrameAlpha = Math.max(maximumFrameAlpha, delta);
          assert.ok(delta < .01, `strict actual glyph/layer opacity continuity at ${speed}x/${duration}s (${delta})`);
        }
        const movingPairs = a.background.map((point, id) => [point, b.background[id]]); let cursor = 0;
        for (const particle of field.title) {
          const point = a.title[cursor], later = b.title[cursor];
          if (a.title[cursor].alpha + a.title[cursor + 1].alpha >= .01) movingPairs.push([point, later]);
          cursor += 4 + (particle.n > .92 ? 1 : 0);
        }
        assert.equal(cursor, a.title.length);
        for (const [point, later] of movingPairs) {
          const rx = point.x - field.cx, ry = point.y - field.cy;
          if (Math.hypot(rx / ax, ry / ay) < .05) continue;
          if (rx * (later.y - point.y) - ry * (later.x - point.x) > 0) nativeClockwise++;
          nativeDirections++;
        }
      }
      assert.ok(nativeClockwise / nativeDirections >= .98, 'actual visible draws use the controlled clockwise helper paths');
      const formed = capture(end); let cursor = 0;
      for (const particle of field.title) {
        const group = formed.title.slice(cursor, cursor + 4 + (particle.n > .92 ? 1 : 0)); cursor += group.length;
        assert.equal(group[0].alpha + group[1].alpha, 0);
        assert.equal(group[2].x, particle.x); assert.equal(group[2].y, particle.y);
        assert.equal(group[3].x, particle.x); assert.equal(group[3].y, particle.y);
        assert.ok(Math.max(group[2].alpha, group[3].alpha) >= .8, 'all control settings finish at readable exact stationary letters');
      }
      const alphas = capture(end + 16.2).background.map(point => point.strongest).sort((a, b) => a - b);
      const meanStrongestAlpha = alphas.reduce((sum, alpha) => sum + alpha, 0) / alphas.length, upperQuartile = alphas[Math.floor((alphas.length - 1) * .75)];
      assert.ok(meanStrongestAlpha >= .08 && upperQuartile >= .095, 'the existing individual background brightness floors survive every allowed control extreme');
      observations.push({ width, height, speed, duration, helperClockwiseFraction: positive / directions, nativeClockwiseFraction: nativeClockwise / nativeDirections, maximumNormalizedVelocity, maximumNormalizedAcceleration, maximumFrameAlpha, meanStrongestAlpha, upperQuartile }); field.destroy();
    }
  }
  console.log('Default/extreme control matrix: ' + JSON.stringify(observations));
});

test('formed background distributes glyph density over ellipse area without a thin bright outer-ring pileup', () => {
  const observations = [], time = renderer.DEFAULTS.revealDelay + renderer.DEFAULTS.wanderSeconds + renderer.DEFAULTS.revealSeconds + 16.2;
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [844, 390]]) {
    const harness = createHarness(width, height), { field } = harness;
    field.time = time; const calls = harness.capture().filter(draw => draw.layer === 1), points = [];
    const margin = Math.max(12, Math.min(width, height) * .025), ax = width / 2 - margin, ay = Math.min(field.cy, height - field.cy) - margin;
    for (const call of calls) {
      const previous = points.at(-1);
      if (previous && previous.x === call.x && previous.y === call.y) previous.alpha += call.alpha;
      else points.push({ x: call.x, y: call.y, alpha: call.alpha, radius: Math.hypot((call.x - field.cx) / ax, (call.y - field.cy) / ay), angle: Math.atan2((call.y - field.cy) / ay, (call.x - field.cx) / ax) });
    }
    assert.equal(points.length, Math.ceil(width / field.cell) * Math.ceil(height / field.row), 'all formed background identities contribute to density without wordmark contamination');
    const maximumRadius = Math.max(...points.map(point => point.radius)), outer = points.filter(point => point.radius >= maximumRadius * .95);
    const areaCdf = [.25, .5, .75].map(radius => ({ radiusFraction: radius, expectedAreaFraction: radius * radius, actualGlyphFraction: points.filter(point => point.radius <= maximumRadius * radius).length / points.length }));
    const bins = Array(32).fill(0);
    for (const point of points) {
      const sector = Math.min(7, Math.floor(((point.angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 8));
      const band = Math.min(3, Math.floor((point.radius / maximumRadius) ** 2 * 4)); bins[band * 8 + sector]++;
    }
    const totalInk = points.reduce((sum, point) => sum + point.alpha, 0);
    observations.push({ width, height, maximumRadius, outerShellAreaFraction: 1 - .95 ** 2, outerShellGlyphFraction: outer.length / points.length, outerShellInkFraction: outer.reduce((sum, point) => sum + point.alpha, 0) / totalInk, areaCdf, occupiedAreaBins: bins.filter(count => count > 0).length / bins.length, maximumAreaBinGlyphFraction: Math.max(...bins) / points.length }); field.destroy();
  }
  console.log('Formed background radial density: ' + JSON.stringify(observations));
  for (const observation of observations) {
    assert.ok(observation.maximumRadius <= 1, 'formed glyph anchors remain inside the reserved ellipse');
    // An outer 5%-radius shell occupies 9.75% of disk area. Finite grid and
    // gentle radial turbulence allow sampling variation, not a corner pileup.
    assert.ok(observation.outerShellGlyphFraction <= .18, `the outer shell does not collect a hard glyph ring (${observation.outerShellGlyphFraction})`);
    assert.ok(observation.outerShellInkFraction <= .2, 'the outer shell does not collect a bright ink ring');
    for (const bin of observation.areaCdf) assert.ok(Math.abs(bin.actualGlyphFraction - bin.expectedAreaFraction) <= .08, 'radial glyph mass follows ellipse area instead of collapsing the rectangular corners');
    assert.equal(observation.occupiedAreaBins, 1, 'density continues to cover every angular sector and radial area band');
    assert.ok(observation.maximumAreaBinGlyphFraction <= .065, 'equal-area bins cannot contain concentrated edge ridges');
  }
});
