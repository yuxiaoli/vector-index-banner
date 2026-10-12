import { AsciiField } from './renderer.js';
const scene=document.querySelector('#scene'),canvas=document.querySelector('#field');
const pause=document.querySelector('#pause'),replay=document.querySelector('#replay'),motion=document.querySelector('#motion'),status=document.querySelector('#status');
const preference=matchMedia('(prefers-reduced-motion: reduce)');
let renderer,userPaused=false,pageHidden=false,motionOverride=null;
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
  :userPaused?'Animation paused. Select Play to continue.':message||'Smooth continuous flow.';
}
try{
 renderer=new AsciiField(canvas,{reduced:preference.matches});scene.classList.add('canvas-ready');sync();
 pause.addEventListener('click',()=>{userPaused=!userPaused;renderer.setPaused(userPaused||pageHidden);sync()});
 replay.addEventListener('click',()=>{userPaused=false;renderer.replay();if(pageHidden)renderer.setPaused(true);sync('Replaying the gradual reveal. Flow continues.')});
 motion.addEventListener('click',()=>{motionOverride=!renderer.reduced;renderer.setReduced(motionOverride);if(!motionOverride){userPaused=false;renderer.setPaused(pageHidden)}sync()});
 // Follow the device until the visitor deliberately chooses a motion setting.
 const onPreference=e=>{if(motionOverride===null){renderer.setReduced(e.matches);sync()}};preference.addEventListener?.('change',onPreference);
 // Lifecycle suspension is separate from the visitor's intentional pause.
 window.addEventListener('pagehide',()=>{pageHidden=true;renderer.setPaused(true)});
 window.addEventListener('pageshow',()=>{if(pageHidden){pageHidden=false;renderer.setPaused(userPaused);sync()}});
}catch(error){console.warn('ASCII renderer unavailable; showing a readable fallback.',error);document.querySelector('.controls').hidden=true;status.textContent='Animation unavailable. Showing a still composition.'}
