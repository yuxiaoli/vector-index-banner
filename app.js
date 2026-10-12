import { AsciiField } from './renderer.js';
const scene=document.querySelector('#scene'),canvas=document.querySelector('#field');
const pause=document.querySelector('#pause'),replay=document.querySelector('#replay'),motion=document.querySelector('#motion'),status=document.querySelector('#status');
const flowSpeed=document.querySelector('#flow-speed'),flowValue=document.querySelector('#flow-value');
const formationDuration=document.querySelector('#formation-duration'),durationValue=document.querySelector('#duration-value');
const preference=matchMedia('(prefers-reduced-motion: reduce)');
let renderer,userPaused=false,pageHidden=false,motionOverride=null,selectedFlow=1,selectedDuration=45;
function syncFlow(){flowSpeed.value=String(selectedFlow);flowValue.textContent=`${selectedFlow.toFixed(2)}×`;flowSpeed.setAttribute('aria-valuetext',`${selectedFlow.toFixed(2)} times normal flow speed`)}
function syncDuration(){formationDuration.value=String(selectedDuration);durationValue.textContent=`${selectedDuration}s`;formationDuration.setAttribute('aria-valuetext',`${selectedDuration} seconds total, including a 10-second opening`)}
function sync(message=''){
 scene.classList.toggle('paused',userPaused);scene.classList.toggle('reduced',renderer.reduced);
 pause.querySelector('span').textContent=userPaused?'Play':'Pause';pause.setAttribute('aria-label',userPaused?'Play animation':'Pause animation');
 pause.disabled=renderer.reduced;replay.disabled=renderer.reduced;
 motion.setAttribute('aria-pressed',String(!renderer.reduced));
 motion.setAttribute('aria-label',renderer.reduced?'Enable animation motion':'Turn animation motion off');
 motion.title=renderer.reduced?'Enable continuous animation':'Show a still composition';
 motion.querySelector('.motion-label').textContent=renderer.reduced?'Enable motion':'Motion';
 motion.querySelector('.motion-state').textContent=renderer.reduced?'off':'on';
 status.textContent=renderer.reduced
  ?(motionOverride===null&&preference.matches?'Still composition. Your device prefers reduced motion.':'Still composition. Enable motion to animate.')
  :userPaused?'Animation paused. Select Play to continue.':message||'Irregular wandering. Noise gradually becomes Vector Index.';
}
try{
 renderer=new AsciiField(canvas,{reduced:preference.matches});scene.classList.add('canvas-ready');sync();syncFlow();syncDuration();
 flowSpeed.addEventListener('input',()=>{const value=Number(flowSpeed.value);if(Number.isFinite(value))selectedFlow=Math.max(.25,Math.min(2,value));renderer.setFlowSpeed(selectedFlow);syncFlow()});
 formationDuration.addEventListener('input',()=>{const value=Number(formationDuration.value);if(Number.isFinite(value))selectedDuration=Math.max(30,Math.min(60,value));renderer.setFormationDuration(selectedDuration);syncDuration()});
 pause.addEventListener('click',()=>{userPaused=!userPaused;renderer.setPaused(userPaused||pageHidden);sync()});
 replay.addEventListener('click',()=>{userPaused=false;renderer.replay();if(pageHidden)renderer.setPaused(true);sync('Replaying the gradual reveal. Flow continues.')});
 motion.addEventListener('click',()=>{motionOverride=!renderer.reduced;renderer.setReduced(motionOverride);if(!motionOverride){userPaused=false;renderer.setPaused(pageHidden)}sync()});
 // Follow the device until the visitor deliberately chooses a motion setting.
 const onPreference=e=>{if(motionOverride===null){renderer.setReduced(e.matches);sync()}};preference.addEventListener?.('change',onPreference);
 // Lifecycle suspension is separate from the visitor's intentional pause.
 window.addEventListener('pagehide',()=>{pageHidden=true;renderer.setPaused(true)});
 window.addEventListener('pageshow',()=>{if(pageHidden){pageHidden=false;renderer.setPaused(userPaused);sync()}});
}catch(error){console.warn('ASCII renderer unavailable; showing a readable fallback.',error);document.querySelector('.controls').hidden=true;status.textContent='Animation unavailable. Showing a still composition.'}
