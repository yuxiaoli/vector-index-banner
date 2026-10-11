import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Exercise the shipped app's actual event handlers. Only the renderer boundary
// and browser DOM are replaced; drawing and RAF behavior have separate tests.
const appSource=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const rendererImport="import { AsciiField } from './renderer.js';";
assert.ok(appSource.startsWith(rendererImport),'app imports the tested renderer boundary');
const handlers=appSource.slice(rendererImport.length);

function createElement(){
 const flags=new Set();
 return {
  textContent:'',disabled:false,hidden:false,attributes:{},children:{},listeners:{},
  classList:{add(value){flags.add(value)},toggle(value,on){if(on)flags.add(value);else flags.delete(value)},contains(value){return flags.has(value)}},
  setAttribute(name,value){this.attributes[name]=value},
  querySelector(selector){return this.children[selector]??=createElement()},
  addEventListener(name,handler){this.listeners[name]=handler},
  click(){if(!this.disabled)this.listeners.click?.()}
 };
}

function mount({reduced=false,rendererUnavailable=false}={}){
 const elements={};
 for(const selector of ['#scene','#field','#pause','#replay','#motion','#status','.controls'])elements[selector]=createElement();
 const media={
  matches:reduced,listeners:{},
  addEventListener(name,handler){this.listeners[name]=handler},
  change(value){this.matches=value;this.listeners.change?.({matches:value})}
 };
 const lifecycle={};
 let field;
 class AsciiField {
  constructor(canvas,options){
   if(rendererUnavailable)throw new Error('Canvas 2D unavailable');
   assert.equal(canvas,elements['#field']);
   this.paused=false;this.reduced=options.reduced;this.replays=0;field=this;
  }
  setPaused(value){this.paused=value}
  setReduced(value){this.reduced=value}
  replay(){this.paused=false;this.replays++}
 }
 runInNewContext(handlers,{
  AsciiField,
  document:{querySelector:selector=>elements[selector]},
  matchMedia:query=>{assert.equal(query,'(prefers-reduced-motion: reduce)');return media},
  window:{addEventListener:(name,handler)=>{lifecycle[name]=handler}},
  console:{warn(){}}
 },{filename:'app.js'});
 return {elements,field,media,event:name=>lifecycle[name]?.()};
}

const reduced=mount({reduced:true});
assert.equal(reduced.field.reduced,true,'device preference defaults to a still composition');
assert.equal(reduced.elements['#motion'].children['.motion-label'].textContent,'Enable motion');
assert.equal(reduced.elements['#motion'].attributes['aria-pressed'],'false','motion off is not pressed');
assert.match(reduced.elements['#motion'].attributes['aria-label'],/Enable/);
assert.match(reduced.elements['#status'].textContent,/device prefers reduced motion/);
assert.equal(reduced.elements['#pause'].disabled,true);
assert.equal(reduced.elements['#replay'].disabled,true);
reduced.elements['#replay'].click();
assert.equal(reduced.field.replays,0,'disabled replay cannot start motion');
reduced.elements['#motion'].click();
assert.equal(reduced.field.reduced,false,'deliberate enable leaves reduced mode');
assert.equal(reduced.field.paused,false,'deliberate enable starts playback');
assert.equal(reduced.elements['#motion'].attributes['aria-pressed'],'true','motion on is pressed');
assert.equal(reduced.elements['#pause'].disabled,false);
assert.equal(reduced.elements['#replay'].disabled,false);
assert.match(reduced.elements['#status'].textContent,/continuous flow/);
reduced.media.change(false);reduced.media.change(true);
assert.equal(reduced.field.reduced,false,'explicit enabled choice survives device preference changes');

reduced.elements['#pause'].click();
assert.equal(reduced.field.paused,true);
assert.equal(reduced.elements['#pause'].children.span.textContent,'Play');
reduced.event('pagehide');reduced.event('pagehide');reduced.event('pageshow');
assert.equal(reduced.field.paused,true,'page restoration preserves an intentional pause');
assert.match(reduced.elements['#status'].textContent,/paused/);
reduced.elements['#motion'].click();
assert.equal(reduced.field.reduced,true);
assert.equal(reduced.elements['#motion'].attributes['aria-pressed'],'false');
assert.match(reduced.elements['#status'].textContent,/Enable motion to animate/);
reduced.elements['#motion'].click();
assert.equal(reduced.field.reduced,false);
assert.equal(reduced.field.paused,false,'Enable motion also resumes a previously paused composition');
assert.equal(reduced.elements['#pause'].children.span.textContent,'Pause');

reduced.elements['#pause'].click();reduced.elements['#replay'].click();
assert.equal(reduced.field.paused,false,'replay resumes animation');
assert.equal(reduced.field.replays,1);
assert.match(reduced.elements['#status'].textContent,/Replaying/);
reduced.event('pagehide');
assert.equal(reduced.field.paused,true,'pagehide temporarily suspends a running animation');
reduced.event('pageshow');reduced.event('pageshow');
assert.equal(reduced.field.paused,false,'page restoration resumes a previously running animation');

const automatic=mount();
assert.equal(automatic.field.reduced,false);
assert.equal(automatic.elements['#motion'].attributes['aria-pressed'],'true');
automatic.media.change(true);
assert.equal(automatic.field.reduced,true,'device preference changes apply before a manual choice');
automatic.media.change(false);
assert.equal(automatic.field.reduced,false);
automatic.elements['#motion'].click();
automatic.media.change(true);automatic.media.change(false);
assert.equal(automatic.field.reduced,true,'explicit still choice also survives device preference changes');

const fallback=mount({rendererUnavailable:true});
assert.equal(fallback.elements['.controls'].hidden,true,'renderer failure hides unusable controls');
assert.equal(fallback.elements['#scene'].classList.contains('canvas-ready'),false,'readable fallback remains visible');
assert.match(fallback.elements['#status'].textContent,/unavailable.*still composition/);

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const statusTag=html.match(/<[^>]+id="status"[^>]*>/)?.[0];
assert.ok(statusTag,'status exists in the shipped page');
assert.match(statusTag,/class="motion-status"/,'state is visible instead of only screen-reader text');
assert.doesNotMatch(statusTag,/sr-only|hidden/);
assert.match(statusTag,/role="status"/);
assert.match(statusTag,/aria-live="polite"/);
assert.match(html,/aria-describedby="status"/,'controls describe their current motion state');
assert.equal((html.match(/id="status"/g)??[]).length,1);

console.log('PASS: reduced-motion default and visible explanation; explicit enable/resume; per-page preference override; motion aria state; pause/replay; BFCache preservation; readable fallback.');
