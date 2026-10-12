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
  textContent:'',value:'',disabled:false,hidden:false,attributes:{},children:{},listeners:{},
  classList:{add(value){flags.add(value)},toggle(value,on){if(on)flags.add(value);else flags.delete(value)},contains(value){return flags.has(value)}},
  setAttribute(name,value){this.attributes[name]=value},
  querySelector(selector){return this.children[selector]??=createElement()},
  addEventListener(name,handler){this.listeners[name]=handler},
  click(){if(!this.disabled)this.listeners.click?.()},
  input(value){this.value=String(value);if(!this.disabled)this.listeners.input?.()}
 };
}

function mount({reduced=false,rendererUnavailable=false}={}){
 const elements={};
 for(const selector of ['#scene','#field','#pause','#replay','#motion','#status','.controls','#flow-speed','#flow-value','#formation-duration','#duration-value'])elements[selector]=createElement();
 elements['#flow-speed'].value='1';elements['#formation-duration'].value='96';
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
   this.paused=false;this.reduced=options.reduced;this.replays=0;this.flowSpeed=1;this.formationDuration=96;this.flowUpdates=[];this.durationUpdates=[];field=this;
  }
  setPaused(value){this.paused=value}
  setReduced(value){this.reduced=value}
  replay(){this.paused=false;this.replays++}
  setFlowSpeed(value){this.flowSpeed=value;this.flowUpdates.push(value)}
  setFormationDuration(value){this.formationDuration=value;this.durationUpdates.push(value)}
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
assert.match(reduced.elements['#status'].textContent,/Irregular wandering.*Noise gradually becomes Vector Index/);
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

const adjustable=mount();
adjustable.elements['#flow-speed'].input('1.75');
assert.equal(adjustable.field.flowSpeed,1.75,'flow input configures renderer speed');
assert.equal(adjustable.field.formationDuration,96,'flow adjustment leaves formation duration alone');
assert.equal(adjustable.field.replays,0,'flow adjustment does not restart assembly');
assert.equal(adjustable.field.paused,false,'flow adjustment keeps playback state');
assert.equal(adjustable.elements['#flow-value'].textContent,'1.75×','flow output displays its current multiplier');
assert.equal(adjustable.elements['#flow-speed'].attributes['aria-valuetext'],'1.75 times normal flow speed');

adjustable.elements['#formation-duration'].input('160');
assert.equal(adjustable.field.formationDuration,160,'duration input configures future formation pace');
assert.equal(adjustable.field.flowSpeed,1.75,'duration adjustment leaves flow speed alone');
assert.equal(adjustable.field.replays,0,'duration adjustment does not restart assembly');
assert.equal(adjustable.elements['#duration-value'].textContent,'160s','duration output displays seconds');
assert.equal(adjustable.elements['#formation-duration'].attributes['aria-valuetext'],'160 seconds for a full formation');

const bounded=mount();
bounded.elements['#flow-speed'].input('12');
assert.equal(bounded.field.flowSpeed,2,'speed cannot exceed its declared maximum');
assert.equal(bounded.elements['#flow-speed'].value,'2','out-of-range input returns to the bounded setting');
bounded.elements['#flow-speed'].input('-1');
assert.equal(bounded.field.flowSpeed,.25,'speed cannot fall below its declared minimum');
bounded.elements['#flow-speed'].input('not-a-number');
assert.equal(bounded.field.flowSpeed,.25,'invalid input preserves the last valid speed');

bounded.elements['#formation-duration'].input('300');
assert.equal(bounded.field.formationDuration,180,'duration cannot exceed its declared maximum');
assert.equal(bounded.elements['#formation-duration'].value,'180','duration input returns to its bounded setting');
bounded.elements['#formation-duration'].input('0');
assert.equal(bounded.field.formationDuration,45,'duration cannot fall below its declared minimum');
bounded.elements['#formation-duration'].input('not-a-number');
assert.equal(bounded.field.formationDuration,45,'invalid input preserves the last valid duration');

const pausedSettings=mount();
pausedSettings.elements['#pause'].click();
pausedSettings.elements['#flow-speed'].input('.5');
pausedSettings.elements['#formation-duration'].input('120');
assert.equal(pausedSettings.field.paused,true,'settings changes preserve a deliberate pause');
assert.equal(pausedSettings.elements['#scene'].classList.contains('paused'),true);
assert.equal(pausedSettings.elements['#pause'].children.span.textContent,'Play');
assert.match(pausedSettings.elements['#status'].textContent,/paused/);
assert.equal(pausedSettings.field.replays,0,'paused settings changes cannot restart assembly');
pausedSettings.elements['#replay'].click();
assert.equal(pausedSettings.field.replays,1);
assert.equal(pausedSettings.field.flowSpeed,.5,'replay retains the selected flow speed');
assert.equal(pausedSettings.field.formationDuration,120,'replay retains the selected duration');
assert.equal(pausedSettings.elements['#flow-value'].textContent,'0.50×');
assert.equal(pausedSettings.elements['#duration-value'].textContent,'120s');

const stillSettings=mount({reduced:true});
assert.equal(stillSettings.elements['#flow-speed'].disabled,false,'settings remain available in reduced motion');
assert.equal(stillSettings.elements['#formation-duration'].disabled,false);
stillSettings.elements['#flow-speed'].input('2');
stillSettings.elements['#formation-duration'].input('45');
assert.equal(stillSettings.field.reduced,true,'setting preferences cannot enable motion');
assert.equal(stillSettings.field.replays,0,'reduced-mode settings cannot replay');
assert.equal(stillSettings.elements['#motion'].attributes['aria-pressed'],'false');
assert.match(stillSettings.elements['#status'].textContent,/device prefers reduced motion/);
stillSettings.elements['#motion'].click();
assert.equal(stillSettings.field.flowSpeed,2,'explicit enable retains selected settings');
assert.equal(stillSettings.field.formationDuration,45);

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

for(const [id,label,value,min,max,step,output] of [
 ['flow-speed','Flow speed','1','0.25','2','0.05','flow-value'],
 ['formation-duration','Formation duration','96','45','180','1','duration-value']
]){
 const tag=html.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`))?.[0];
 assert.ok(tag,`${label} exists in the shipped page`);
 const attributes=Object.fromEntries([...tag.matchAll(/([a-z-]+)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
 assert.equal(attributes.type,'range',`${label} uses a native keyboard and touch control`);
 assert.equal(attributes.min,min);assert.equal(attributes.max,max);assert.equal(attributes.step,step);assert.equal(attributes.value,value);
 assert.equal(attributes['aria-describedby'],'timing-help',`${label} explains its duration semantics`);
 assert.notEqual(attributes.tabindex,'-1',`${label} remains in keyboard navigation`);
 assert.match(html,new RegExp(`<label for="${id}">${label}`),`${label} has a visible, associated name`);
 assert.match(html,new RegExp(`<output id="${output}" for="${id}">`),`${label} has an associated visible value`);
 assert.equal((html.match(new RegExp(`id="${id}"`,'g'))??[]).length,1);
 assert.ok(html.indexOf(`id="${id}"`)>html.indexOf('<div class="controls"'),`${label} shares the fallback-hidden controls group`);
 assert.ok(html.indexOf(`id="${id}"`)<html.indexOf('<div class="control-buttons"'),`${label} belongs inside the same controls group`);
}
assert.match(html,/id="timing-help">Duration changes remaining pace\. Replay starts a full cycle\./,'visible help explains progress-preserving duration changes and replay');

console.log('PASS: labelled native speed/duration controls; independent bounded updates; visible values and duration explanation; paused/reduced settings; replay persistence; reduced-motion preference/override; pause/replay; BFCache preservation; readable fallback.');
