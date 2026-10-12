import assert from 'node:assert/strict';
import test from 'node:test';
import * as renderer from '../renderer.js';

const { DEFAULTS, timingAt, AsciiField } = renderer;

test('assembly waits for an initial wandering phase and lasts at least ninety seconds without slowing the flow clock', () => {
  for (const time of [4, 10, 18]) {
    assert.equal(timingAt(time).progress, 0, `letters have not started assembling at ${time}s`);
  }
  assert.ok(DEFAULTS.wanderSeconds >= 15, 'there is time to see the initial wandering');
  assert.ok(DEFAULTS.revealSeconds >= 90, 'assembly is gradual for at least ninety seconds');
  const start = DEFAULTS.revealDelay + DEFAULTS.wanderSeconds;
  const end = start + DEFAULTS.revealSeconds;
  assert.equal(timingAt(start).progress, 0);
  assert.equal(timingAt(start + DEFAULTS.revealSeconds / 2).progress, .5);
  assert.ok(timingAt(end - 1).progress < 1);
  assert.equal(timingAt(end).progress, 1);
  const longerAssembly = { ...DEFAULTS, revealSeconds: DEFAULTS.revealSeconds * 2 };
  for (const time of [10, 30, 60]) {
    const normal = timingAt(time), longer = timingAt(time, longerAssembly);
    assert.equal(longer.spin, normal.spin, 'longer assembly does not slow the moving background');
    assert.equal(longer.arc, normal.arc);
    assert.equal(longer.shimmer, normal.shimmer);
  }
});

test('visible title particles follow curved coherent flow before stationary letters assemble', () => {
  let dimensions = { width: 1440, height: 900 }, draws = [], fontStage = 0;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const context = {
    setTransform() {}, fillRect() { draws = []; fontStage = 0; },
    set font(value) { this.fontValue = value; fontStage++; }, get font() { return this.fontValue; },
    fillText(char, x, y) { if (fontStage === 2) draws.push({ x, y, char, alpha: this.globalAlpha }); }
  };
  const canvas = {
    getContext() { return context; },
    getBoundingClientRect() { return { ...dimensions, left: 0, top: 0 }; },
    parentElement: { addEventListener() {}, removeEventListener() {} }
  };
  const observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    dimensions = { width, height }; const field = new AsciiField(canvas);
    const capture = time => {
      field.time = time; field.render();
      let cursor = 0;
      const particles = field.title.map(particle => {
        const group = draws.slice(cursor, cursor + 4 + (particle.n > .92 ? 1 : 0));
        cursor += group.length;
        assert.ok(group.length >= 2, 'stable particle draw groups remain observable');
        return { x: group[0].x, y: group[0].y, alpha: Math.max(group[0].alpha, group[1].alpha) };
      });
      assert.equal(cursor, draws.length, 'particle identity follows the stable title order');
      return particles;
    };
    const [a, b, c] = [4, 6, 8].map(capture);
    let visible = 0, moving = 0, curved = 0, targetDistance = 0;
    for (let id = 0; id < a.length; id++) {
      if (a[id].alpha >= .15) visible++;
      const ab = { x: b[id].x - a[id].x, y: b[id].y - a[id].y };
      const bc = { x: c[id].x - b[id].x, y: c[id].y - b[id].y };
      const lengthA = Math.hypot(ab.x, ab.y), lengthB = Math.hypot(bc.x, bc.y);
      if (lengthA >= 6) moving++;
      if (lengthA >= 3 && lengthB >= 3 && Math.abs(ab.x * bc.y - ab.y * bc.x) / (lengthA * lengthB) >= .1) curved++;
      targetDistance += Math.hypot(a[id].x - field.title[id].x, a[id].y - field.title[id].y);
      for (const point of [a[id], b[id], c[id]]) {
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.alpha));
        assert.ok(point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height, 'wandering glyph anchors remain within the viewport');
      }
    }
    const observation = { width, height, visible: visible / a.length, moving: moving / a.length, curved: curved / a.length, meanTargetDistance: targetDistance / a.length };
    observations.push(observation);
    assert.ok(observation.visible >= .8, `${width}x${height}: at least 80% of early particles are visibly drawn (${observation.visible})`);
    assert.ok(observation.moving >= .5, `${width}x${height}: most particles move at least 6px over 2s (${observation.moving})`);
    assert.ok(observation.curved >= .5, `${width}x${height}: most early paths visibly turn (${observation.curved})`);
    for (let id = 0; id < field.title.length; id += 37) {
      const expected = renderer.particlePoseAt(id, field.title[id], { width, height, fontSize: field.titleFont }, 4, field.options);
      assert.ok(Math.hypot(a[id].x - expected.x, a[id].y - expected.y) < 1e-9, 'actual title draws use the exported particle pose');
    }
    assert.deepEqual(capture(4), a, 'the same time produces the same path without random jitter');
    field.destroy();
  }
  console.log('Visible wandering draws: ' + JSON.stringify(observations));
});

test('background glyph anchors follow continuous curved local paths before and after the wordmark settles', () => {
  let dimensions = { width: 1440, height: 900 }, points = [], fontStage = 0, previous = null;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const context = {
    setTransform() {}, fillRect() { points = []; fontStage = 0; previous = null; },
    set font(value) { this.fontValue = value; fontStage++; }, get font() { return this.fontValue; },
    fillText(char, x, y) {
      if (fontStage !== 1) return;
      if (!previous || previous.x !== x || previous.y !== y) points.push({ x, y });
      previous = { x, y };
    }
  };
  const canvas = { getContext: () => context, getBoundingClientRect: () => ({ ...dimensions, left: 0, top: 0 }), parentElement: { addEventListener() {}, removeEventListener() {} } };
  const observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    dimensions = { width, height }; const field = new AsciiField(canvas);
    const capture = time => { field.time = time; field.render(); return points; };
    const [a, b, c] = [10, 12, 14].map(capture);
    const cols = Math.ceil(width / field.cell), rows = Math.ceil(height / field.row);
    assert.equal(a.length, cols * rows, 'one stable anchor per background cell');
    let moving = 0, curved = 0;
    for (let id = 0; id < a.length; id++) {
      const ab = { x: b[id].x - a[id].x, y: b[id].y - a[id].y }, bc = { x: c[id].x - b[id].x, y: c[id].y - b[id].y };
      const lengthA = Math.hypot(ab.x, ab.y), lengthB = Math.hypot(bc.x, bc.y);
      if (lengthA >= field.cell * .35) moving++;
      if (lengthA >= field.cell * .2 && lengthB >= field.cell * .2 && Math.abs(ab.x * bc.y - ab.y * bc.x) / (lengthA * lengthB) >= .1) curved++;
    }
    const observation = { width, height, moving: moving / a.length, curved: curved / a.length };
    observations.push(observation);
    assert.ok(observation.moving >= .6, `${width}x${height}: most background glyphs move visibly over 2s (${observation.moving})`);
    assert.ok(observation.curved >= .5, `${width}x${height}: local glyph paths turn (${observation.curved})`);
    assert.equal(typeof renderer.fieldPoseAt, 'function');
    const layout = { width, height, cell: field.cell, row: field.row };
    for (let id = 0; id < a.length; id += 17) {
      const expected = renderer.fieldPoseAt(id % cols, Math.floor(id / cols), layout, 10, field.options);
      assert.ok(Math.hypot(a[id].x - expected.x, a[id].y - expected.y) < 1e-9, 'actual background draws use the exported deterministic pose');
    }
    const end = DEFAULTS.revealDelay + DEFAULTS.wanderSeconds + DEFAULTS.revealSeconds;
    const after = capture(end + 8), later = capture(end + 10);
    const meanMotion = after.reduce((sum, point, id) => sum + Math.hypot(point.x - later[id].x, point.y - later[id].y), 0) / after.length;
    assert.ok(meanMotion >= field.cell * .35, 'physical background flow continues after the title has settled');
    assert.deepEqual(capture(10), a, 'background paths are deterministic');
    field.destroy();
  }
  console.log('Physical background wandering: ' + JSON.stringify(observations));
});

test('dispersed identities share one flow clock independently of their later targets and assembly duration', () => {
  assert.equal(typeof renderer.particlePoseAt, 'function', 'a deterministic physical title pose is available');
  assert.equal(typeof renderer.fieldPoseAt, 'function');
  const longer = { ...DEFAULTS, revealSeconds: DEFAULTS.revealSeconds * 2 };
  const fasterLocal = { ...DEFAULTS, clockwiseRadiansPerSecond: DEFAULTS.clockwiseRadiansPerSecond * 1.5 };
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    const viewport = { width, height, fontSize: 10 }, layout = { width, height, cell: 6.1, row: 9.15 };
    const a = { x: width * .2, y: height * .3 }, b = { x: width * .8, y: height * .7 };
    let earlyMotion = 0, rateResponsive = 0;
    for (let id = 0; id < 64; id++) {
      for (const time of [4, 10, 18]) {
        const normal = renderer.particlePoseAt(id, a, viewport, time);
        const origin = renderer.seedOriginAt(id, viewport);
        const shared = renderer.flowPoseAt(origin, viewport, time);
        assert.equal(normal.x, shared.x); assert.equal(normal.y, shared.y);
        assert.deepEqual(renderer.particlePoseAt(id, a, viewport, time, longer), normal, 'longer assembly preserves the initial coherent clock');
        assert.deepEqual(renderer.particlePoseAt(id, b, viewport, time), normal, 'the same initial identity is independent of its future letter target');
        assert.notDeepEqual(renderer.seedOriginAt(id + 1000, viewport), origin, 'different identities start dispersed instead of sharing a target silhouette');
        assert.equal(normal.settle, 0);
      }
      const start = renderer.particlePoseAt(id, a, viewport, 4), later = renderer.particlePoseAt(id, a, viewport, 6);
      earlyMotion += Math.hypot(later.x - start.x, later.y - start.y);
      const altered = renderer.particlePoseAt(id, a, viewport, 6, fasterLocal);
      if (Math.hypot(altered.x - later.x, altered.y - later.y) >= 3) rateResponsive++;
      for (const time of [4, 10, 18]) {
        assert.deepEqual(renderer.fieldPoseAt(id % 12, Math.floor(id / 12), layout, time, longer), renderer.fieldPoseAt(id % 12, Math.floor(id / 12), layout, time), 'background physics stays independent of assembly progress');
      }
    }
    assert.ok(earlyMotion / 64 >= Math.min(width, height) * .015, 'local wandering remains visibly faster than assembly');
    assert.ok(rateResponsive / 64 >= .8, 'local velocity can change without shortening assembly');
  }
});

test('physical paths have bounded velocity and acceleration through wandering and final settlement', () => {
  assert.equal(typeof renderer.particlePoseAt, 'function');
  assert.equal(typeof renderer.fieldPoseAt, 'function');
  const dt = 1 / 30, end = DEFAULTS.revealDelay + DEFAULTS.wanderSeconds + DEFAULTS.revealSeconds;
  const observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    const viewport = { width, height, fontSize: 10 }, layout = { width, height, cell: 6.1, row: 9.15 };
    const target = { x: width * .4, y: height * .5 };
    const cols = Math.ceil(width / layout.cell), rows = Math.ceil(height / layout.row);
    let titleVelocity = 0, titleAcceleration = 0, fieldVelocity = 0, fieldAcceleration = 0;
    const measure = (a, b, c) => ({
      velocity: Math.hypot(b.x - a.x, b.y - a.y) / dt,
      acceleration: Math.hypot(c.x - 2 * b.x + a.x, c.y - 2 * b.y + a.y) / (dt * dt)
    });
    for (let sample = 0; sample < 16; sample++) {
      const id = sample * 43, i = (sample * 13 + 5) % cols, j = (sample * 17 + 7) % rows;
      let previousSettle = 0;
      for (let frame = 0; frame <= Math.ceil((end + 1) / dt); frame++) {
        const time = frame * dt;
        const title = [0, 1, 2].map(offset => renderer.particlePoseAt(id, target, viewport, time + offset * dt));
        const background = [0, 1, 2].map(offset => renderer.fieldPoseAt(i, j, layout, time + offset * dt));
        for (const point of [...title, ...background]) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), 'positions remain finite');
        assert.ok(title[0].x >= 0 && title[0].x <= width && title[0].y >= 0 && title[0].y <= height);
        assert.ok(title[0].settle >= previousSettle && title[0].settle <= 1, 'assembly converges monotonically');
        previousSettle = title[0].settle;
        const a = measure(...title), b = measure(...background);
        titleVelocity = Math.max(titleVelocity, a.velocity); titleAcceleration = Math.max(titleAcceleration, a.acceleration);
        fieldVelocity = Math.max(fieldVelocity, b.velocity); fieldAcceleration = Math.max(fieldAcceleration, b.acceleration);
        assert.ok(a.velocity <= 120, `title velocity stays below 120px/s (${a.velocity})`);
        assert.ok(a.acceleration <= 160, `title acceleration stays below 160px/s² (${a.acceleration})`);
        // Global rotation speed scales with orbit radius, replacing the old
        // small per-cell loops. Both layers retain the same physical limits.
        assert.ok(b.velocity <= 120, 'global background velocity stays below 120px/s');
        assert.ok(b.acceleration <= 160, 'global background acceleration stays below 160px/s²');
      }
      for (const time of [end, end + 1, end + 100]) {
        const pose = renderer.particlePoseAt(id, target, viewport, time);
        assert.equal(pose.settle, 1, 'the stable layer is fully formed');
        assert.deepEqual({ x: pose.x, y: pose.y }, renderer.flowPoseAt(target, viewport, time), 'the invisible flow layer keeps its forward clock instead of unwinding');
      }
    }
    observations.push({ width, height, titleVelocity, titleAcceleration, fieldVelocity, fieldAcceleration });
  }
  console.log('Physical path bounds at 30fps: ' + JSON.stringify(observations));
});

test('replay restores coherent flow and reduced motion shows the exact completed wordmark', () => {
  let dimensions = { width: 1440, height: 900 }, draws = { background: [], title: [] }, fontStage = 0;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.document = {
    hidden: false, addEventListener() {}, removeEventListener() {},
    createElement() { return { width: 0, height: 0, getContext() { return { drawImage() {} }; } }; }
  };
  const context = {
    setTransform() {}, drawImage() {},
    fillRect() { draws = { background: [], title: [] }; fontStage = 0; },
    set font(value) { this.fontValue = value; fontStage++; }, get font() { return this.fontValue; },
    fillText(char, x, y) { draws[fontStage === 1 ? 'background' : 'title'].push({ char, x, y, alpha: this.globalAlpha }); }
  };
  const canvas = { getContext: () => context, getBoundingClientRect: () => ({ ...dimensions, left: 0, top: 0 }), parentElement: { addEventListener() {}, removeEventListener() {} } };
  const end = DEFAULTS.revealDelay + (DEFAULTS.wanderSeconds || 0) + DEFAULTS.revealSeconds;
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    dimensions = { width, height }; const field = new AsciiField(canvas);
    const capture = time => { field.time = time; field.render(); return draws; };
    const positions = (frame, layer = 'stable') => {
      let cursor = 0;
      return field.title.map(particle => {
        const group = frame.title.slice(cursor, cursor + 4 + (particle.n > .92 ? 1 : 0));
        cursor += group.length;
        const first = layer === 'flow' ? 0 : 2;
        return { x: group[first].x, y: group[first].y, alpha: Math.max(group[first].alpha, group[first + 1].alpha) };
      });
    };
    const early = capture(4);
    field.time = end + 10; field.setPaused(true); field.replay();
    assert.equal(field.time, 0); assert.equal(field.paused, false);
    assert.ok(field.replaySnapshot, 'replay retains the previous image for a dissolve');
    assert.deepEqual(capture(4), early, 'replay returns to the same deterministic wandering composition');
    assert.ok(positions(draws, 'flow').every(point => point.alpha >= .15), 'replay starts with visible flowing glyphs');
    assert.ok(positions(draws).every(point => point.alpha <= .01), 'replay removes the already formed stationary wordmark');
    field.replaySnapshot = null;
    for (const time of [end, end + 1]) {
      const finished = positions(capture(time));
      for (let id = 0; id < finished.length; id++) {
        assert.equal(finished[id].x, field.title[id].x);
        assert.equal(finished[id].y, field.title[id].y);
        assert.ok(finished[id].alpha >= .8, 'completed letters retain readable opacity');
      }
    }
    field.setReduced(true);
    const still = capture(0), complete = positions(still);
    for (let id = 0; id < complete.length; id++) {
      assert.equal(complete[id].x, field.title[id].x, 'reduced motion uses exact final x coordinates');
      assert.equal(complete[id].y, field.title[id].y, 'reduced motion uses exact final y coordinates');
      assert.ok(complete[id].alpha >= .8);
    }
    assert.deepEqual(capture(1000), still, 'reduced motion freezes positions and opacity of the whole composition');
    const time = field.time; field.replay(); assert.equal(field.time, time);
    assert.equal(field.replaySnapshot, null);
    field.destroy();
  }
});
