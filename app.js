import { AsciiField } from './renderer.js';
const scene=document.querySelector('#scene'),canvas=document.querySelector('#field');
const pause=document.querySelector('#pause'),replay=document.querySelector('#replay'),motion=document.querySelector('#motion'),status=document.querySelector('#status');
const preference=matchMedia('(prefers-reduced-motion: reduce)');
let renderer;
function sync(message=''){
 scene.classList.toggle('paused',renderer.paused);scene.classList.toggle('reduced',renderer.reduced);
 pause.querySelector('span').textContent=renderer.paused?'Play':'Pause';pause.setAttribute('aria-label',renderer.paused?'Play animation':'Pause animation');
 pause.disabled=renderer.reduced;pause.style.opacity=renderer.reduced?'.35':'1';
 motion.setAttribute('aria-pressed',String(renderer.reduced));motion.querySelector('.motion-state').textContent=renderer.reduced?'off':'on';
 replay.disabled=renderer.reduced;replay.style.opacity=renderer.reduced?'.35':'1';
 if(message)status.textContent=message;
}
try{
 renderer=new AsciiField(canvas,{reduced:preference.matches});scene.classList.add('canvas-ready');sync();
 pause.addEventListener('click',()=>{renderer.setPaused(!renderer.paused);sync(renderer.paused?'Animation paused.':'Animation playing.')});
 replay.addEventListener('click',()=>{renderer.replay();sync('Replaying the reveal.')});
 motion.addEventListener('click',()=>{renderer.setReduced(!renderer.reduced);sync(renderer.reduced?'Reduced motion. Showing a still composition.':'Motion enabled.')});
 const onPreference=e=>{renderer.setReduced(e.matches);sync()};preference.addEventListener?.('change',onPreference);
 window.addEventListener('pagehide',()=>{renderer.setPaused(true)},{once:false});
 window.addEventListener('pageshow',e=>{if(e.persisted){renderer.setPaused(false);sync()}});
}catch(error){console.warn('ASCII renderer unavailable; showing a readable fallback.',error);document.querySelector('.controls').hidden=true}
