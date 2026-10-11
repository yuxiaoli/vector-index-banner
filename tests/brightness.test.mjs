import assert from 'node:assert/strict';
import test from 'node:test';
import { AsciiField, DEFAULTS } from '../renderer.js';

test('fully revealed moving background uses clearly visible individual glyph opacity on desktop and mobile', () => {
  let dimensions = { width: 1440, height: 900 }, nextId = 1, cells = new Map();
  globalThis.requestAnimationFrame = () => nextId++;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const context = {
    fontStage: 0,
    setTransform() {},
    fillRect() {
      assert.equal(this.fillStyle.toUpperCase(), '#000000');
      this.fontStage = 0; cells = new Map();
    },
    set font(value) { this.fontValue = value; this.fontStage++; },
    get font() { return this.fontValue; },
    fillText(char, x, y) {
      if (this.fontStage !== 1) return;
      assert.equal(this.fillStyle.toUpperCase(), '#11FF00');
      // First font assignment is the background; the second is the wordmark.
      // Keep the strongest individual crossfade draw, rather than adding alpha
      // from two different glyphs and overstating how bright either glyph is.
      const key = `${x}|${y}`;
      cells.set(key, Math.max(cells.get(key) || 0, this.globalAlpha));
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
    for (const time of [60, 62, 65]) {
      field.time = time; field.render();
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
  assert.equal(DEFAULTS.revealSeconds, 42);
});

test('absolute background contrast changes remain stronger over two and five seconds after reveal', () => {
  let dimensions = { width: 1440, height: 900 }, nextId = 1, cells = new Map();
  globalThis.requestAnimationFrame = () => nextId++;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const context = {
    fontStage: 0, setTransform() {},
    fillRect() { this.fontStage = 0; cells = new Map(); },
    set font(value) { this.fontValue = value; this.fontStage++; },
    get font() { return this.fontValue; },
    fillText(char, x, y) {
      if (this.fontStage !== 1) return;
      assert.ok(Number.isFinite(this.globalAlpha) && this.globalAlpha >= 0 && this.globalAlpha <= 1, 'background alpha remains finite and bounded');
      const key = `${x}|${y}`;
      cells.set(key, (cells.get(key) || 0) + this.globalAlpha);
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
    const frames = [60, 62, 65].map(time => {
      field.time = time; field.render();
      assert.equal(cells.size, Math.ceil(width / field.cell) * Math.ceil(height / field.row));
      return cells;
    });
    const meanChange = later => {
      let absolute = 0;
      for (const [key, alpha] of frames[0]) absolute += Math.abs(alpha - later.get(key));
      return absolute / frames[0].size;
    };
    observations.push({ width, height, afterTwoSeconds: meanChange(frames[1]), afterFiveSeconds: meanChange(frames[2]) });
    field.destroy();
  }
  console.log('Absolute background alpha change: ' + JSON.stringify(observations));
  for (const observation of observations) {
    const label = `${observation.width}x${observation.height}`;
    // Absolute change cannot be satisfied by normalizing against an equally dim frame.
    // Compare each cell's summed crossfade weight to isolate broad moving contrast.
    assert.ok(observation.afterTwoSeconds >= .03, `${label}: mean absolute background alpha change over 2s ${observation.afterTwoSeconds} must reach .03`);
    assert.ok(observation.afterFiveSeconds >= .047, `${label}: mean absolute background alpha change over 5s ${observation.afterFiveSeconds} must reach .047`);
  }
});
