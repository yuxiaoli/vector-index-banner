import assert from 'node:assert/strict';
import test from 'node:test';
import { AsciiField, DEFAULTS } from '../renderer.js';
const afterFormation = DEFAULTS.revealDelay + DEFAULTS.wanderSeconds + DEFAULTS.revealSeconds + 16.2;
const wallAtCanonical = seconds => seconds * DEFAULTS.totalDuration / (DEFAULTS.revealDelay + DEFAULTS.wanderSeconds + DEFAULTS.revealSeconds);

test('fully revealed moving background uses clearly visible individual glyph opacity on desktop and mobile', () => {
  let dimensions = { width: 1440, height: 900 }, nextId = 1, cells = new Map(), cellIndex = -1, lastPosition = null;
  globalThis.requestAnimationFrame = () => nextId++;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const context = {
    fontStage: 0,
    setTransform() {},
    fillRect() {
      assert.equal(this.fillStyle.toUpperCase(), '#000000');
      this.fontStage = 0; cells = new Map(); cellIndex = -1; lastPosition = null;
    },
    set font(value) { this.fontValue = value; this.fontStage++; },
    get font() { return this.fontValue; },
    fillText(char, x, y) {
      if (this.fontStage !== 1) return;
      assert.equal(this.fillStyle.toUpperCase(), '#11FF00');
      // First font assignment is the background; the second is the wordmark.
      // Keep the strongest individual crossfade draw, rather than adding alpha
      // from two different glyphs and overstating how bright either glyph is.
      if (!lastPosition || x !== lastPosition.x || y !== lastPosition.y) cellIndex++;
      lastPosition = { x, y };
      cells.set(cellIndex, Math.max(cells.get(cellIndex) || 0, this.globalAlpha));
    }
  };
  const canvas = {
    getContext(type) { assert.equal(type, '2d'); return context; },
    getBoundingClientRect() { return { ...dimensions, left: 0, top: 0 }; },
    parentElement: { addEventListener() {}, removeEventListener() {} }
  };
  const observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    dimensions = { width, height };
    const field = new AsciiField(canvas);
    for (const time of [afterFormation, afterFormation + 2, afterFormation + 5]) {
      field.time = wallAtCanonical(time); field.render();
      assert.equal(cells.size, Math.ceil(width / field.cell) * Math.ceil(height / field.row), 'every background cell is measured without wordmark contamination');
      const alphas = [...cells.values()].sort((a, b) => a - b);
      observations.push({
        width, height, time,
        mean: alphas.reduce((sum, alpha) => sum + alpha, 0) / alphas.length,
        upperQuartile: alphas[Math.floor((alphas.length - 1) * .75)]
      });
    }
    field.destroy();
  }
  console.log('Individual background glyph opacity: ' + JSON.stringify(observations));
  for (const observation of observations) {
    const label = `${observation.width}x${observation.height} at ${observation.time}s`;
    // Near twice the old mobile mean and upper quartile,
    // giving the moving field a useful opacity floor after the reveal finishes.
    assert.ok(observation.mean >= .08, `${label}: mean strongest-glyph opacity ${observation.mean} must reach .08`);
    assert.ok(observation.upperQuartile >= .095, `${label}: upper-quartile strongest-glyph opacity ${observation.upperQuartile} must reach .095`);
  }
  assert.equal(DEFAULTS.vortexRadiansPerSecond, .04);
  assert.equal(DEFAULTS.arcRadiansPerSecond, .09);
  assert.ok(DEFAULTS.revealSeconds >= 90);
});

test('absolute screen-space background ink transport stays visible over two and five seconds after reveal', () => {
  let dimensions = { width: 1440, height: 900 }, nextId = 1, cells = new Map(), cellIndex = -1, lastPosition = null;
  globalThis.requestAnimationFrame = () => nextId++;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const context = {
    fontStage: 0, setTransform() {},
    fillRect() { this.fontStage = 0; cells = new Map(); cellIndex = -1; lastPosition = null; },
    set font(value) { this.fontValue = value; this.fontStage++; },
    get font() { return this.fontValue; },
    fillText(char, x, y) {
      if (this.fontStage !== 1) return;
      assert.ok(Number.isFinite(this.globalAlpha) && this.globalAlpha >= 0 && this.globalAlpha <= 1, 'background alpha remains finite and bounded');
      if (!lastPosition || x !== lastPosition.x || y !== lastPosition.y) cellIndex++;
      lastPosition = { x, y };
      const cell = cells.get(cellIndex) || { x, y, alpha: 0 };
      cell.alpha += this.globalAlpha; cells.set(cellIndex, cell);
    }
  };
  const canvas = {
    getContext() { return context; },
    getBoundingClientRect() { return { ...dimensions, left: 0, top: 0 }; },
    parentElement: { addEventListener() {}, removeEventListener() {} }
  };
  const observations = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    dimensions = { width, height };
    const field = new AsciiField(canvas);
    const frames = [afterFormation, afterFormation + 2, afterFormation + 5].map(time => {
      field.time = wallAtCanonical(time); field.render();
      assert.equal(cells.size, Math.ceil(width / field.cell) * Math.ceil(height / field.row));
      return cells;
    });
    const screenInk = frame => {
      const bins = new Map();
      for (const point of frame.values()) {
        const key = [Math.floor(point.x / field.cell), Math.floor(point.y / field.row)].join('|');
        bins.set(key, (bins.get(key) || 0) + point.alpha);
      }
      return bins;
    };
    const reference = screenInk(frames[0]);
    const meanChange = later => {
      const transported = screenInk(later);
      let absolute = 0;
      for (const key of new Set([...reference.keys(), ...transported.keys()])) absolute += Math.abs((reference.get(key) || 0) - (transported.get(key) || 0));
      return absolute / frames[0].size;
    };
    observations.push({ width, height, afterTwoSeconds: meanChange(frames[1]), afterFiveSeconds: meanChange(frames[2]) });
    field.destroy();
  }
  console.log('Absolute screen-space background ink transport: ' + JSON.stringify(observations));
  for (const observation of observations) {
    const label = `${observation.width}x${observation.height}`;
    // Absolute change cannot be satisfied by normalizing against an equally dim frame.
    // Fixed screen bins observe advected ink, normalized by source glyph count;
    // constant logical-id alpha must not be mistaken for a static composition.
    assert.ok(observation.afterTwoSeconds >= .03, `${label}: mean absolute background alpha change over 2s ${observation.afterTwoSeconds} must reach .03`);
    assert.ok(observation.afterFiveSeconds >= .047, `${label}: mean absolute background alpha change over 5s ${observation.afterFiveSeconds} must reach .047`);
  }
});
