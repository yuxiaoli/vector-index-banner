import assert from 'node:assert/strict';
import test from 'node:test';
import * as renderer from '../renderer.js';

test('foreground and background share clockwise screen-space motion', () => {
  const observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    const viewport = { width, height, fontSize: 10, cell: 6.1, row: 9.15 };
    const center = { x: width / 2, y: height * (width <= 700 ? .44 : .46) };
    for (const layer of ['foreground', 'background']) {
      let clockwise = 0, tested = 0;
      for (let id = 0; id < 96; id++) {
        const target = { x: width * (.1 + (id % 12) * .8 / 11), y: height * (.1 + Math.floor(id / 12) * .8 / 7) };
        const pose = time => layer === 'foreground'
          ? renderer.particlePoseAt(id, target, viewport, time)
          : renderer.fieldPoseAt(Math.floor(target.x / viewport.cell), Math.floor(target.y / viewport.row), viewport, time);
        const a = pose(10), b = pose(10.05), rx = a.x - center.x, ry = a.y - center.y;
        if (Math.hypot(rx, ry) < Math.min(width, height) * .075) continue;
        const cross = rx * (b.y - a.y) - ry * (b.x - a.x);
        if (cross > 0) clockwise++;
        tested++;
      }
      observations.push({ width, height, layer, clockwiseFraction: clockwise / tested, tested });
    }
  }
  console.log('Clockwise screen-space direction: ' + JSON.stringify(observations));
  for (const observation of observations) {
    assert.ok(observation.clockwiseFraction >= .98, `${observation.width}x${observation.height} ${observation.layer}: at least 98% of noncentral paths turn clockwise (${observation.clockwiseFraction})`);
  }
});

test('the background carries source ink with the clockwise flow instead of independently cycling its ribbon brightness', () => {
  let dimensions = { width: 1440, height: 900 }, cells = [], fontStage = 0, previous = null;
  globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const context = {
    setTransform() {}, fillRect() { cells = []; fontStage = 0; previous = null; },
    set font(value) { this.fontValue = value; fontStage++; }, get font() { return this.fontValue; },
    fillText(char, x, y) {
      if (fontStage !== 1) return;
      if (!previous || x !== previous.x || y !== previous.y) cells.push({ x, y, alpha: 0 });
      cells.at(-1).alpha += this.globalAlpha; previous = { x, y };
    }
  };
  const canvas = { getContext: () => context, getBoundingClientRect: () => ({ ...dimensions, left: 0, top: 0 }), parentElement: { addEventListener() {}, removeEventListener() {} } };
  const end = renderer.DEFAULTS.revealDelay + renderer.DEFAULTS.wanderSeconds + renderer.DEFAULTS.revealSeconds;
  const observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    dimensions = { width, height }; const field = new renderer.AsciiField(canvas);
    const capture = time => { field.time = time; field.render(); return cells; };
    const before = capture(end + 16.2), after = capture(end + 18.2);
    assert.equal(before.length, after.length);
    let alphaChange = 0, positionChange = 0;
    for (let id = 0; id < before.length; id++) {
      alphaChange += Math.abs(after[id].alpha - before[id].alpha);
      positionChange += Math.hypot(after[id].x - before[id].x, after[id].y - before[id].y);
    }
    observations.push({ width, height, meanSourceAlphaChange: alphaChange / before.length, meanPhysicalMotion: positionChange / before.length });
    field.destroy();
  }
  console.log('Advected background source ink: ' + JSON.stringify(observations));
  for (const observation of observations) {
    assert.ok(observation.meanSourceAlphaChange <= .001, 'formed-background source ink stays attached to its shared streamlines');
    assert.ok(observation.meanPhysicalMotion >= 5, 'steady source ink still visibly moves on screen');
  }
});

test('the flowing title progressively reveals a readable stationary wordmark instead of rotating it forever', () => {
  let dimensions = { width: 1440, height: 900 }, anchors = new Map(), fontStage = 0;
  globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const context = {
    setTransform() {}, fillRect() { anchors = new Map(); fontStage = 0; },
    set font(value) { this.fontValue = value; fontStage++; }, get font() { return this.fontValue; },
    fillText(char, x, y) {
      if (fontStage !== 2) return;
      const key = `${x}|${y}`; anchors.set(key, Math.max(anchors.get(key) || 0, this.globalAlpha));
    }
  };
  const canvas = { getContext: () => context, getBoundingClientRect: () => ({ ...dimensions, left: 0, top: 0 }), parentElement: { addEventListener() {}, removeEventListener() {} } };
  const end = renderer.DEFAULTS.revealDelay + renderer.DEFAULTS.wanderSeconds + renderer.DEFAULTS.revealSeconds;
  const observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    dimensions = { width, height }; const field = new renderer.AsciiField(canvas);
    const frames = [10, 40, 70, 100, end].map(time => {
      field.time = time; field.render();
      const alphas = field.title.map(point => anchors.get(`${point.x}|${point.y}`) || 0);
      return { time, meanTargetOpacity: alphas.reduce((sum, alpha) => sum + alpha, 0) / alphas.length, readableTargetFraction: alphas.filter(alpha => alpha >= .8).length / alphas.length };
    });
    observations.push({ width, height, frames }); field.destroy();
  }
  console.log('Progressive stationary wordmark: ' + JSON.stringify(observations));
  for (const observation of observations) {
    assert.ok(observation.frames[0].meanTargetOpacity <= .01, 'the complete fixed wordmark is not visible before assembly');
    for (let index = 1; index < observation.frames.length; index++) assert.ok(observation.frames[index].meanTargetOpacity > observation.frames[index - 1].meanTargetOpacity, 'stationary letter contrast increases during assembly');
    assert.ok(observation.frames[2].meanTargetOpacity >= .2, 'clear stationary letter strokes emerge during the middle phase');
    assert.ok(observation.frames.at(-1).readableTargetFraction >= .99, 'the final wordmark has exact readable stationary targets');
  }
});

test('the shared clockwise clock stays forward and neighboring streamlines stay coherent throughout assembly', () => {
  const dt = 1 / 30, end = renderer.DEFAULTS.revealDelay + renderer.DEFAULTS.wanderSeconds + renderer.DEFAULTS.revealSeconds;
  const omega = renderer.DEFAULTS.clockwiseRadiansPerSecond ?? .1;
  const observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    const cx = width / 2, cy = height * (width <= 700 ? .44 : .46), ax = width / 2, ay = Math.min(cy, height - cy);
    const viewport = { width, height, cell: 6.1, row: 9.15 };
    const normalize = point => ({ x: (point.x - cx) / ax, y: (point.y - cy) / ay });
    const angularRate = (a, b) => {
      const p = normalize(a), q = normalize(b);
      return Math.atan2(p.x * q.y - p.y * q.x, p.x * q.x + p.y * q.y) / dt;
    };
    let minimumRate = Infinity, maximumRate = 0, maximumDispersion = 0, agrees = 0, neighbors = 0;
    for (let sample = 0; sample < 32; sample++) {
      const angle = sample * Math.PI * 2 / 16, radius = sample < 16 ? .45 : .8;
      const source = { x: cx + ax * radius * Math.cos(angle), y: cy + ay * radius * Math.sin(angle) };
      const i = Math.floor(source.x / viewport.cell), j = Math.floor(source.y / viewport.row);
      for (let frame = 0; frame <= Math.ceil((end + 1) / dt); frame++) {
        const time = frame * dt;
        for (const pose of [t => renderer.particlePoseAt(sample, source, viewport, t), t => renderer.fieldPoseAt(i, j, viewport, t)]) {
          const a = pose(time), b = pose(time + dt), rate = angularRate(a, b);
          assert.ok(Number.isFinite(rate));
          assert.ok(rate >= omega * .75, `no layer stalls, reverses, or unwinds at a handoff boundary (angular rate ${rate})`);
          assert.ok(rate <= omega * 1.3, 'turbulence does not create independent fast angular paths');
          minimumRate = Math.min(minimumRate, rate); maximumRate = Math.max(maximumRate, rate);
        }
      }
    }
    for (const time of [4, 18, 40, 70, 110, end + 1]) {
      const rates = [];
      for (let sample = 0; sample < 32; sample++) {
        const angle = sample * Math.PI * 2 / 32;
        const source = { x: cx + ax * .8 * Math.cos(angle), y: cy + ay * .8 * Math.sin(angle) };
        const i = Math.floor(source.x / viewport.cell), j = Math.floor(source.y / viewport.row);
        const a = renderer.fieldPoseAt(i, j, viewport, time), b = renderer.fieldPoseAt(i, j, viewport, time + dt);
        rates.push(angularRate(a, b));
        const c = renderer.fieldPoseAt(i + 1, j, viewport, time), d = renderer.fieldPoseAt(i + 1, j, viewport, time + dt);
        const u = normalize({ x: cx + b.x - a.x, y: cy + b.y - a.y }), v = normalize({ x: cx + d.x - c.x, y: cy + d.y - c.y });
        const agreement = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
        if (agreement >= .9) agrees++;
        neighbors++;
      }
      const mean = rates.reduce((sum, value) => sum + value, 0) / rates.length;
      const dispersion = Math.sqrt(rates.reduce((sum, value) => sum + (value - mean) ** 2, 0) / rates.length) / mean;
      maximumDispersion = Math.max(maximumDispersion, dispersion);
      assert.ok(dispersion <= .15, 'angular direction and pace remain coherent across the field');
    }
    assert.ok(agrees / neighbors >= .95, 'neighboring visible streamlines share a direction');
    observations.push({ width, height, minimumRate, maximumRate, maximumDispersion, neighborAgreement: agrees / neighbors });
  }
  console.log('Uninterrupted clockwise coherence at 30fps: ' + JSON.stringify(observations));
});

test('actual flowing and stationary draw layers preserve clockwise handoff and strict opacity continuity', () => {
  let dimensions = { width: 1440, height: 900 }, draws = [], fontStage = 0;
  globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const context = {
    setTransform() {}, fillRect() { draws = []; fontStage = 0; },
    set font(value) { this.fontValue = value; fontStage++; }, get font() { return this.fontValue; },
    fillText(char, x, y) { if (fontStage === 2) draws.push({ x, y, char, alpha: this.globalAlpha }); }
  };
  const canvas = { getContext: () => context, getBoundingClientRect: () => ({ ...dimensions, left: 0, top: 0 }), parentElement: { addEventListener() {}, removeEventListener() {} } };
  const dt = 1 / 30, start = renderer.DEFAULTS.revealDelay + renderer.DEFAULTS.wanderSeconds, end = start + renderer.DEFAULTS.revealSeconds;
  const observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    dimensions = { width, height }; const field = new renderer.AsciiField(canvas);
    const expectedDraws = field.title.reduce((count, particle) => count + 4 + (particle.n > .92 ? 1 : 0), 0);
    const capture = time => {
      field.time = time; field.render();
      assert.equal(draws.length, expectedDraws, 'each identity has complementary flow and stationary draw pairs');
      let cursor = 0;
      const groups = field.title.map(particle => {
        const group = draws.slice(cursor, cursor + 4 + (particle.n > .92 ? 1 : 0)); cursor += group.length;
        for (const draw of group) assert.ok(Number.isFinite(draw.x) && Number.isFinite(draw.y) && Number.isFinite(draw.alpha) && draw.alpha >= 0 && draw.alpha <= 1);
        assert.equal(group[0].x, group[1].x); assert.equal(group[0].y, group[1].y);
        assert.equal(group[2].x, particle.x); assert.equal(group[2].y, particle.y);
        assert.equal(group[3].x, particle.x); assert.equal(group[3].y, particle.y);
        const flowAlpha = group[0].alpha + group[1].alpha, stableAlpha = group[2].alpha + group[3].alpha;
        assert.ok(flowAlpha + stableAlpha <= 1, 'handoff does not duplicate full-opacity title ink');
        return { x: group[0].x, y: group[0].y, flowAlpha, stableAlpha };
      });
      return { groups, draws };
    };
    let clockwise = 0, eligible = 0, maxLayerAlphaDelta = 0;
    for (const time of [4, 18, 40, 70, 100]) {
      const a = capture(time), b = capture(time + dt);
      for (let id = 0; id < a.groups.length; id++) {
        const point = a.groups[id], later = b.groups[id], rx = point.x - field.cx, ry = point.y - field.cy;
        if (point.flowAlpha < .01 || Math.hypot(rx, ry) < Math.min(width, height) * .075) continue;
        if (rx * (later.y - point.y) - ry * (later.x - point.x) > 0) clockwise++;
        eligible++;
      }
    }
    assert.ok(clockwise / eligible >= .98, 'visible flowing draws keep clockwise direction during the entire handoff');
    const checkpoints = [4, 18, 40, 70, 100];
    for (let frame = 0; frame <= Math.ceil(renderer.DEFAULTS.revealDelay / dt); frame++) checkpoints.push(frame * dt);
    for (const boundary of [start, end]) for (const offset of [-2 * dt, -dt, 0, dt, 2 * dt]) checkpoints.push(boundary + offset);
    for (const time of checkpoints) {
      const a = capture(time), b = capture(time + dt);
      for (let layer = 0; layer < a.draws.length; layer++) {
        const delta = Math.abs(a.draws[layer].alpha - b.draws[layer].alpha);
        maxLayerAlphaDelta = Math.max(maxLayerAlphaDelta, delta);
        assert.ok(delta < .01, `strict per-identity/layer opacity continuity at ${time}s (${delta})`);
      }
    }
    observations.push({ width, height, clockwiseVisibleFraction: clockwise / eligible, eligible, maxLayerAlphaDelta });
    field.destroy();
  }
  console.log('Actual clockwise draw-layer continuity: ' + JSON.stringify(observations));
});
