import assert from 'node:assert/strict';
import {AsciiField,DEFAULTS,timingAt,glyphStateAt} from '../renderer.js';
let nextId=1, callbacks=new Map(), dimensions={width:1440,height:900};
const calls={text:0,fill:0},listeners={};let samples=new Map();
globalThis.requestAnimationFrame=fn=>{const id=nextId++;callbacks.set(id,fn);return id};
globalThis.cancelAnimationFrame=id=>callbacks.delete(id);
globalThis.window={devicePixelRatio:3,addEventListener(){},removeEventListener(){}};
globalThis.document={hidden:false,addEventListener(name,fn){listeners[name]=fn},removeEventListener(){},createElement(){return{width:0,height:0,getContext(){return{drawImage(){}}}}}};
globalThis.ResizeObserver=class{observe(){}disconnect(){}};
globalThis.IntersectionObserver=class{constructor(fn){this.fn=fn}observe(){}disconnect(){}};
const context={setTransform(){},fillRect(){calls.fill++},fillText(char,x,y){assert.ok(Number.isFinite(x)&&Number.isFinite(y));assert.equal(char.length,1);calls.text++;const key=[char,x,y].join('|');samples.set(key,(samples.get(key)||0)+(this.globalAlpha??1))},drawImage(){},createRadialGradient(){return{addColorStop(){}}}};
const canvas={getContext(type){assert.equal(type,'2d');return context},getBoundingClientRect(){return{...dimensions,left:0,top:0}},parentElement:{addEventListener(){},removeEventListener(){}}};
const field=new AsciiField(canvas);
assert.equal(field.dpr,1.5);assert.ok(field.title.length>500);assert.ok(field.title.every(p=>p.x>=0&&p.x<dimensions.width&&p.y>=0&&p.y<dimensions.height));
assert.ok(callbacks.size===1);field.time=8;field.render();assert.ok(calls.text>1000);const t=field.time;
field.setPaused(true);assert.equal(callbacks.size,0);field.tick(2000);assert.equal(field.time,t);
field.setReduced(true);assert.equal(callbacks.size,0);field.setPaused(false);assert.equal(callbacks.size,0);
field.setReduced(false);assert.equal(callbacks.size,1);
document.hidden=true;listeners.visibilitychange();assert.equal(callbacks.size,0);document.hidden=false;listeners.visibilitychange();assert.equal(callbacks.size,1);
field.inView=false;field.schedule();assert.equal(callbacks.size,0);field.inView=true;field.replay();assert.equal(field.time,0);assert.equal(callbacks.size,1);
for(const [width,height]of[[390,844],[320,568],[700,540],[844,390],[280,653],[1920,1080]]){dimensions={width,height};field.resize();assert.ok(field.title.every(p=>p.x>=0&&p.x<width&&p.y>=0&&p.y<height),`wordmark fits ${width}x${height}`);field.time=8;field.render()}
const start=performance.now();for(let i=0;i<30;i++){field.time+=1/30;field.render()}console.log(`30 mock-context frames: ${Math.round(performance.now()-start)}ms`);
assert.equal(DEFAULTS.revealSeconds,42);assert.equal(timingAt(1.8).progress,0);assert.equal(timingAt(22.8).progress,.5);assert.equal(timingAt(43.8).progress,1);
assert.ok(timingAt(8).progress<.15,'reveal must remain deliberately slow at 8 seconds');
assert.ok(Math.abs((timingAt(301).spin-timingAt(300).spin)-(timingAt(1).spin-timingAt(0).spin))<1e-12,'no startup acceleration');
assert.ok(timingAt(1).spin-timingAt(0).spin<.004,'vortex drifts less than .004 radians per second');
for(const seconds of [0,8,20,42,100,560]){
 samples=new Map();field.time=seconds;field.replaySnapshot=null;field.render();const previous=samples;
 samples=new Map();field.time=seconds+1/30;field.render();const keys=new Set([...previous.keys(),...samples.keys()]);let maxDelta=0;
 for(const key of keys)maxDelta=Math.max(maxDelta,Math.abs((previous.get(key)||0)-(samples.get(key)||0)));
 assert.ok(maxDelta<.01,`no frame opacity jumps at ${seconds}s: ${maxDelta}`);
}
const glyphWeights=(state)=>{const out=new Map([[state.from,1-state.blend]]);out.set(state.to,(out.get(state.to)||0)+state.blend);return out};
for(let seconds=0;seconds<120;seconds+=.05){const a=glyphWeights(glyphStateAt(17,31,seconds)),b=glyphWeights(glyphStateAt(17,31,seconds+.001));for(const key of new Set([...a.keys(),...b.keys()]))assert.ok(Math.abs((a.get(key)||0)-(b.get(key)||0))<.001,'glyph cycle is continuous')}
field.time=100;field.replay();assert.ok(field.replaySnapshot,'replay preserves previous frame');assert.equal(field.replayElapsed,0);assert.equal(field.time,0);
field.setReduced(true);assert.equal(field.replaySnapshot,null);assert.equal(callbacks.size,0);field.replay();assert.equal(field.time,0);
console.log('PASS: 42s reveal; uniform slow angular velocity; staggered glyph crossfades; continuous per-frame opacity; dissolve replay; reduced-motion replay guard.');
field.destroy();assert.equal(callbacks.size,0);assert.equal(field.destroyed,true);
console.log('PASS: capped DPR; finite drawing; desktop/mobile/landscape geometry; pause/resume; reduced motion; visibility; offscreen; replay; cleanup.');
