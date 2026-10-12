/**
 * Vector Index / ASCII field, original Canvas 2D implementation.
 * Dependency-free, no GPU requirement. Instantiate, then destroy on unmount.
 * One coherent clockwise field carries glyphs through a gradual text reveal.
 */
export const DEFAULTS = Object.freeze({
 maxDpr: 1.5, fps: 30, revealSeconds: 96, revealDelay: 1.8, wanderSeconds: 18,
 // Legacy texture clocks remain available from timingAt; shared motion below
 // makes one clockwise turn in about 63 seconds, independent of assembly.
 vortexRadiansPerSecond: .04, arcRadiansPerSecond: .09,
 clockwiseRadiansPerSecond: .1, flowTurbulenceRadians: .1,
 flowDeformationRadians: .6, flowSpiralRadians: 2.4,
 glyphCycleSeconds: 56, glyphCrossfadeSeconds: 12,
 shimmerRadiansPerSecond: .028, pointerEaseSeconds: 2.4,
 replayFadeSeconds: 5.5, background: '#000000'
});
const GLYPHS = {
 V:['10001','10001','10001','10001','10001','01010','00100'],
 E:['11111','10000','10000','11110','10000','10000','11111'],
 C:['01111','10000','10000','10000','10000','10000','01111'],
 T:['11111','00100','00100','00100','00100','00100','00100'],
 O:['01110','10001','10001','10001','10001','10001','01110'],
 R:['11110','10001','10001','11110','10100','10010','10001'],
 I:['11111','00100','00100','00100','00100','00100','11111'],
 N:['10001','11001','11001','10101','10011','10011','10001'],
 D:['11110','10001','10001','10001','10001','10001','11110'],
 X:['10001','10001','01010','00100','01010','10001','10001']
};
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const smooth=(v)=>{v=clamp(v);return v*v*(3-2*v)};
const hash=(x,y)=>{let n=Math.imul(x|0,374761393)+Math.imul(y|0,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295};
const ALPHABET='VECTORINDEX01.:+*=/<>[]{}';
// A single continuous clock. No startup acceleration or frame-count-based motion.
export function timingAt(seconds, options=DEFAULTS) {
 const t=Math.max(0,seconds), progress=clamp((t-options.revealDelay-options.wanderSeconds)/options.revealSeconds);
 return { progress, reveal:smooth(progress), spin:.6+t*options.vortexRadiansPerSecond, arc:t*options.arcRadiansPerSecond, shimmer:t*options.shimmerRadiansPerSecond };
}
export function glyphStateAt(i,j,t,options=DEFAULTS) {
 const phase=t/options.glyphCycleSeconds+hash(i+193,j-113), cycle=Math.floor(phase);
 const interval=options.glyphCrossfadeSeconds/options.glyphCycleSeconds;
 return { from:ALPHABET[Math.floor(hash(i+cycle*137,j+37)*ALPHABET.length)], to:ALPHABET[Math.floor(hash(i+(cycle+1)*137,j+37)*ALPHABET.length)], blend:smooth((phase-cycle-(1-interval))/interval) };
}
// One spatially coherent field carries every glyph clockwise on bounded ellipses.
export function flowPoseAt(point,viewport,seconds,options=DEFAULTS){
 const w=viewport.width,h=viewport.height,cx=viewport.centerX??w/2,cy=viewport.centerY??h*(w<=700?.44:.46);
 const margin=Math.max(12,Math.min(w,h)*.025),ax=Math.max(0,Math.min(cx,w-cx)-margin),ay=Math.max(0,Math.min(cy,h-cy)-margin);
 if(!ax||!ay)return{x:cx,y:cy};
 const nx=(point.x-cx)/ax,ny=(point.y-cy)/ay,r=Math.hypot(nx,ny),a=Math.atan2(ny,nx),radius=.98*Math.tanh(r/.98);
 const t=Math.max(0,seconds),omega=Math.max(0,options.clockwiseRadiansPerSecond),clarity=timingAt(t,options).reveal;
 // Bound annealing and turbulence to less than 15% of the common angular rate.
 const deformation=Math.min(options.flowDeformationRadians,.095*omega*options.revealSeconds/1.5);
 const turbulence=clamp(options.flowTurbulenceRadians,0,.1);
 const angle=a+options.flowSpiralRadians*radius+omega*t
  +deformation*(1-clarity)*Math.sin(a*3+radius*4)
  +turbulence*Math.sin(radius*6+omega*t*.5);
 const distance=radius*(1-.3*(1-clarity)*(1+Math.sin(a*2+radius*5))/2);
 return{x:cx+ax*distance*Math.cos(angle),y:cy+ay*distance*Math.sin(angle)};
}
export function particlePoseAt(id,target,viewport,seconds,options=DEFAULTS){
 return{...flowPoseAt(target,viewport,seconds,options),settle:timingAt(seconds,options).reveal};
}
export function fieldPoseAt(i,j,viewport,seconds,options=DEFAULTS){
 return flowPoseAt({x:(i+.5)*viewport.cell,y:(j+.5)*viewport.row},viewport,seconds,options);
}
export class AsciiField {
 constructor(canvas,options={}) {
  this.canvas=canvas;this.options={...DEFAULTS,...options};this.context=canvas.getContext('2d',{alpha:false});
  if(!this.context)throw new Error('Canvas 2D unavailable');
  this.time=0;this.paused=false;this.reduced=!!options.reduced;this.visible=!document.hidden;this.destroyed=false;this.raf=0;this.previous=0;this.lastDraw=0;
  this.replaySnapshot=null;this.replayElapsed=0;this.pointer={x:0,y:0};this.target={x:0,y:0};this.frameCount=0;
  this.onPointer=e=>{const r=canvas.getBoundingClientRect();this.target={x:((e.clientX-r.left)/r.width-.5)*8,y:((e.clientY-r.top)/r.height-.5)*6}};
  this.onLeave=()=>{this.target={x:0,y:0}};
  this.onVisibility=()=>{this.visible=!document.hidden;this.schedule()};
  this.tick=this.tick.bind(this);this.resize=this.resize.bind(this);
  this.resizeObserver=typeof ResizeObserver!=='undefined'?new ResizeObserver(this.resize):null;
  this.resizeObserver?.observe(canvas);window.addEventListener('resize',this.resize,{passive:true});
  canvas.parentElement.addEventListener('pointermove',this.onPointer,{passive:true});canvas.parentElement.addEventListener('pointerleave',this.onLeave,{passive:true});
  document.addEventListener('visibilitychange',this.onVisibility);
  this.intersection=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{this.inView=entries[0]?.isIntersecting!==false;this.schedule()}):null;
  this.intersection?.observe(canvas);this.inView=true;this.resize();this.schedule();
 }
 resize(){if(this.destroyed)return;const r=this.canvas.getBoundingClientRect();this.width=Math.max(1,r.width);this.height=Math.max(1,r.height);this.dpr=Math.min(window.devicePixelRatio||1,this.options.maxDpr);this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);this.context.setTransform(this.dpr,0,0,this.dpr,0,0);this.mobile=this.width<=700;this.cx=this.width/2;this.cy=this.height*(this.mobile?.44:.46);this.cell=Math.max(6.1,Math.min(8.7,this.width/155));this.row=this.cell*1.5;this.buildWordmark();this.render()}
 buildWordmark(){const lines=this.mobile?['VECTOR','INDEX']:['VECTOR INDEX'];const maxCols=Math.max(...lines.map(s=>s.length*6-1));let unit=Math.min(this.width*(this.mobile?.79:.84)/maxCols,this.mobile?14:19);if(!this.mobile)unit=Math.min(unit,this.height*.18/7);this.titleUnit=unit;const stepX=unit/2,stepY=unit/2;const totalHeight=lines.length===2?unit*17:unit*7;this.title=[];lines.forEach((line,lineIndex)=>{const left=this.cx-(line.length*6-1)*unit/2;const top=this.cy-totalHeight/2+lineIndex*unit*10;[...line].forEach((letter,i)=>{if(!GLYPHS[letter])return;GLYPHS[letter].forEach((row,y)=>{[...row].forEach((on,x)=>{if(on!=='1')return;for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++){const px=left+(i*6+x)*unit+sx*stepX,py=top+y*unit+sy*stepY;this.title.push({x:px,y:py,n:hash(i*73+x*2+sx,y*2+sy+lineIndex*23),radial:Math.hypot((px-this.cx)/(this.width*.48),(py-this.cy)/(totalHeight*.8))})}})})})});this.titleFont=Math.max(4.5,unit*.7);this.wordmarkBounds={width:maxCols*unit,height:totalHeight}}
 schedule(){cancelAnimationFrame(this.raf);this.raf=0;this.previous=0;if(!this.destroyed&&!this.paused&&!this.reduced&&this.visible&&this.inView)this.raf=requestAnimationFrame(this.tick)}
 tick(now){
  if(this.destroyed||this.paused||this.reduced||!this.visible||!this.inView)return;
  this.raf=0;const dt=this.previous?Math.min((now-this.previous)/1000,.075):0;this.previous=now;this.time+=dt;
  if(this.replaySnapshot){this.replayElapsed+=dt;if(this.replayElapsed>=this.options.replayFadeSeconds)this.replaySnapshot=null}
  const ease=1-Math.exp(-dt/this.options.pointerEaseSeconds);
  this.pointer.x+=(this.target.x-this.pointer.x)*ease;this.pointer.y+=(this.target.y-this.pointer.y)*ease;
  if(now-this.lastDraw>=1000/this.options.fps){this.render();this.lastDraw=now}
  if(!this.paused&&!this.reduced&&this.visible&&this.inView)this.raf=requestAnimationFrame(this.tick)
 }
 setPaused(value){this.paused=!!value;this.schedule()}
 setReduced(value){this.reduced=!!value;this.replaySnapshot=null;this.render();this.schedule()}
 replay(){
  if(this.reduced)return;
  // Retain the current frame, then dissolve into the new reveal without a cut.
  const snapshot=document.createElement('canvas');snapshot.width=this.canvas.width;snapshot.height=this.canvas.height;
  const context=snapshot.getContext('2d');if(context){context.drawImage(this.canvas,0,0);this.replaySnapshot=snapshot;this.replayElapsed=0}
  this.time=0;this.paused=false;this.previous=0;this.render();this.schedule()
 }
 render(){
  const c=this.context,w=this.width,h=this.height;if(!w||!h)return;this.frameCount++;
  const t=this.reduced?this.options.revealDelay+this.options.wanderSeconds+this.options.revealSeconds+8:this.time;
  const timing=timingAt(t,this.options),{reveal}=timing;
  const cx=this.cx+(this.reduced?0:this.pointer.x),cy=this.cy+(this.reduced?0:this.pointer.y),size=Math.min(w,h);
  c.globalAlpha=1;c.fillStyle=this.options.background;c.fillRect(0,0,w,h);
  c.fillStyle='#11ff00';c.font=`600 ${this.row*.88}px "SFMono-Regular",Consolas,"Liberation Mono",monospace`;c.textAlign='center';c.textBaseline='middle';
  const cols=Math.ceil(w/this.cell),rows=Math.ceil(h/this.row),intro=1-reveal,fieldViewport={width:w,height:h,cell:this.cell,row:this.row};
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
   const x=(i+.5)*this.cell,y=(j+.5)*this.row,dx=(x-cx)/size,dy=(y-cy)/size,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx);
   // Sample a fixed source-space pattern; the shared field advects its ink.
   const twist=1.5/(r+.23)+.6,ca=Math.cos(twist),sa=Math.sin(twist),sx=dx*ca-dy*sa,sy=dx*sa+dy*ca;
   const stripe=Math.sin(sx*32+Math.sin(sy*10)*.6),ribbon=Math.pow(Math.max(0,stripe),4);
   const arc=Math.pow(Math.max(0,Math.sin(a*3+r*19)),10);
   const core=1-Math.exp(-r*r*24),edge=clamp(1.18-r*.87);
   const centerClear=1-.85*reveal*Math.exp(-Math.pow((x-this.cx)/(this.wordmarkBounds.width*.63),6)-Math.pow((y-this.cy)/(this.wordmarkBounds.height*.74),4));
   let intensity=(.085+ribbon*.52+arc*.16)*core*edge*centerClear+intro*.15*Math.exp(-r*4);
   // Brightness texture stays anchored while each glyph physically drifts.
   intensity*=.58+.42*hash(i+71,j-18);
   // Lift dim phosphor strokes without changing the field's slow motion clock.
   const alpha=Math.pow(clamp(intensity*.64),.76),glyph=glyphStateAt(i,j,t,this.options),pose=this.reduced?{x,y}:fieldPoseAt(i,j,fieldViewport,t,this.options);
   c.globalAlpha=alpha*(1-glyph.blend);c.fillText(glyph.from,pose.x,pose.y);
   if(glyph.blend>0){c.globalAlpha=alpha*glyph.blend;c.fillText(glyph.to,pose.x,pose.y)}
  }
  c.font=`${this.titleFont}px "SFMono-Regular",Consolas,"Liberation Mono",monospace`;c.textAlign='left';c.textBaseline='top';
  const titleViewport={width:w,height:h,fontSize:this.titleFont};
  for(let id=0;id<this.title.length;id++){
   const p=this.title[id],pose=this.reduced?{x:p.x,y:p.y,settle:1}:particlePoseAt(id,p,titleViewport,t,this.options),local=pose.settle;
   // The stream keeps turning clockwise while the exact mark emerges in place.
   const char=p.n>.75?'+':p.n>.25?'#':'=',transition=.55+.45*smooth((local-.12)/.7);
   const shimmer=.965+.035*Math.sin(p.x*.023+p.y*.018+timing.shimmer);
   const opacity=(.72+.28*smooth(t/this.options.revealDelay))*shimmer*.96;
   c.globalAlpha=opacity*(1-local)*(1-transition);c.fillText(p.n>.5?':':'.',pose.x,pose.y);
   c.globalAlpha=opacity*(1-local)*transition;c.fillText(char,pose.x,pose.y);
   c.globalAlpha=opacity*local*(1-transition);c.fillText(p.n>.5?':':'.',p.x,p.y);
   c.globalAlpha=opacity*local*transition;c.fillText(char,p.x,p.y);
   if(p.n>.92){c.globalAlpha=local*.1;c.fillText(char,p.x+.6,p.y)}
  }
  if(this.replaySnapshot){c.globalAlpha=1-smooth(this.replayElapsed/this.options.replayFadeSeconds);c.drawImage(this.replaySnapshot,0,0,this.replaySnapshot.width,this.replaySnapshot.height,0,0,w,h)}
  c.globalAlpha=1;
 }
 destroy(){this.replaySnapshot=null;this.destroyed=true;cancelAnimationFrame(this.raf);this.resizeObserver?.disconnect();this.intersection?.disconnect();window.removeEventListener('resize',this.resize);document.removeEventListener('visibilitychange',this.onVisibility);this.canvas.parentElement.removeEventListener('pointermove',this.onPointer);this.canvas.parentElement.removeEventListener('pointerleave',this.onLeave)}
}
