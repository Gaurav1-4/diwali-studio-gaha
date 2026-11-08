import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { mkdtemp, readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

// Compile to a disposable directory, keeping the app's dependency list small.
const root = new URL('../src/', import.meta.url);
const temp = await mkdtemp(join(tmpdir(), 'diwali-test-'));
async function compile(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const source = join(directory, entry.name);
    if (entry.isDirectory()) await compile(source);
    else if (entry.name.endsWith('.ts') && entry.name !== 'main.ts') {
      const target = join(temp, relative(root.pathname, source)).replace(/\.ts$/, '.mjs');
      await mkdir(dirname(target), { recursive: true });
      const output = ts.transpileModule(await readFile(source, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
      }).outputText.replace(/from (['"])(\.[^'"]+)\1/g, (_, q, specifier) => `from ${q}${specifier}.mjs${q}`)
        .replace(/import\((['"])(\.[^'"]+)\1\)/g, (_, q, specifier) => `import(${q}${specifier}.mjs${q})`)
        .replace(/(['"])@mediapipe\/tasks-vision\1/g, JSON.stringify(pathToFileURL(join(temp, 'vision-stub.mjs')).href));
      await writeFile(target, output);
    }
  }
}
await compile(root.pathname);
await writeFile(join(temp, 'vision-stub.mjs'), 'export const FilesetResolver = {forVisionTasks:async()=>({})}; export const HandLandmarker = {createFromOptions:async()=>({close(){},detectForVideo(){return {landmarks:[],handedness:[]};}})};');
const load = path => import(pathToFileURL(join(temp, path + '.mjs')).href);
const { FireworkDirector } = await load('fireworks/fireworkDirector');
const { ParticlePool } = await load('particles/particle');
const { GangaJamuna } = await load('fireworks/gangaJamuna');
const { Bomb } = await load('fireworks/bomb');
const { Chakri } = await load('fireworks/chakri');
const { GestureClassifier } = await load('vision/gestureClassifier');
const { fingerGeometry, pinchRatio, pinchContact } = await load('vision/handGeometry');
const { HandMotion } = await load('vision/handMotion');
const { VisionEngine } = await load('vision/visionEngine');
const { coverTransform, cameraConstraints } = await load('video/coverTransform');
const { CaptureEngine } = await load('capture/captureEngine');
const { PyroAudioEngine } = await load('audio/pyroAudioEngine');
const { ParticleRenderer } = await load('particles/particleRenderer');
const { renderScale } = await load('video/renderScale');
const { AdaptiveQuality, QUALITY, startingQuality } = await load('performance/quality');
const { CameraSession } = await load('video/cameraSession');
const { cameraWasEnabled, rememberCamera, mayResumeCamera, cameraErrorMessage } = await load('video/cameraPreference');
const { enterFullscreen, leaveFullscreen, isFullscreen } = await load('display/fullscreen');
test.after(() => rm(temp, { recursive: true, force: true }));

const raw = Array.from({length:21}, () => ({x:0.25,y:0.25,z:0}));
const video = () => ({readyState:2,currentTime:1,videoWidth:640,videoHeight:480});
const gesture = (type, continuous = false) => ({type,triggerPoint:{x:500,y:600},handIndex:0,isContinuous:continuous,confidence:1});
const fakeEngine = gestures => {
  const engine = new VisionEngine();
  engine.isReady = true;
  engine.landmarker = {detectForVideo:()=>({landmarks:[raw],handedness:[[{categoryName:'Left'}]]})};
  engine.classifier = {classify:()=>gestures};
  return engine;
};
const context = { save(){}, restore(){} };

test('one camera frame produces only one rocket event across display frames', () => clock(advance => {
  const engine = fakeEngine([gesture('ROCKET')]);
  const camera = video();
  let launches = 0;
  const director = new FireworkDirector(type => {if(type==='ROCKET_LAUNCH') launches++;});
  for(let frame=0;frame<4;frame++) director.handleGestures(engine.update(camera,1920,1080),1920,1080);
  assert.equal(launches,1);
  advance(50);
  camera.currentTime++;
  director.handleGestures(engine.update(camera,1920,1080),1920,1080);
  assert.equal(launches,2);
}));

test('tracking is paced independently of display refresh without replaying discrete events', () => clock(advance => {
  const engine = fakeEngine([gesture('ROCKET'), gesture('ANAR', true)]);
  const camera = video();
  assert.equal(engine.update(camera,1440,900).length,2);
  camera.currentTime++;
  advance(10);
  assert.deepEqual(engine.update(camera,1440,900).map(g=>g.type),['ANAR']);
  advance(40);
  assert.equal(engine.update(camera,1440,900).length,2);
}));

test('continuous fountains persist between camera frames', () => {
  const engine = fakeEngine([gesture('ANAR',true)]);
  const camera = video();
  assert.equal(engine.update(camera,1920,1080).length,1);
  assert.equal(engine.update(camera,1920,1080)[0].type,'ANAR');
});

test('landmarks follow mirrored cover cropping in landscape and portrait', () => {
  for(const [width,height] of [[1920,1080],[390,844]]) {
    const engine = fakeEngine([]);
    engine.update(video(),width,height);
    const cover = coverTransform(640,480,width,height);
    assert.ok(Math.abs(engine.detectedHands[0].landmarks[8].x-(0.75*cover.width+cover.x))<1e-9);
    assert.equal(engine.detectedHands[0].landmarks[8].y,0.25*cover.height+cover.y);
  }
});

function hand(fingers) {
 const landmarks=Array.from({length:21},()=>({x:100,y:200,z:0}));
 landmarks[0]={x:120,y:250,z:0};
 for(const [mcp,x] of [[5,90],[9,110],[13,130],[17,150]]) {
  landmarks[mcp]={x,y:180,z:0};
  const name={5:'index',9:'middle',13:'ring',17:'pinky'}[mcp];
  landmarks[mcp+1]={x,y:fingers[name]?140:190,z:0};
  landmarks[mcp+2]={x,y:fingers[name]?110:210,z:0};
  landmarks[mcp+3]={x,y:fingers[name]?80:220,z:0};
 }
 landmarks[2]={x:80,y:190,z:0};landmarks[4]={x:50,y:180,z:0};
 return {landmarks,rawLandmarks:raw,handedness:'Left',palmCenter:{x:120,y:210,z:0},isPinching:false,
   extendedFingers:{thumb:false,index:false,middle:false,ring:false,pinky:false,...fingers}};
}
function pinchHand() {
 const pose=hand({});pose.isPinching=true;
 pose.landmarks[4]={x:90,y:125,z:0};pose.landmarks[8]={x:90,y:125,z:0};return pose;
}
function shiftHand(pose,dx,dy) {
 pose.landmarks=pose.landmarks.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
 pose.palmCenter={...pose.palmCenter,x:pose.palmCenter.x+dx,y:pose.palmCenter.y+dy};
}
function clock(run) {
 const original=globalThis.performance;
 let now=10000;
 Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});
 try {run(ms=>{now+=ms;});} finally {Object.defineProperty(globalThis,'performance',{value:original,configurable:true});}
}

test('returning hands must satisfy a fresh gesture hold', () => clock(advance=>{
 const classifier=new GestureClassifier();const pose=hand({index:true});
 assert.deepEqual(classifier.classify([pose],1440),[]);
 advance(1000);classifier.classify([],1440);advance(1);
 assert.deepEqual(classifier.classify([pose],1440),[]);
 advance(181);assert.equal(classifier.classify([pose],1440)[0].type,'ROCKET');
}));

test('all nine single-hand signs are distinct and the requested mappings are preserved', () => {
 for(const handedness of ['Left','Right'])for(const [type,fingers,adjust] of [
  ['ROCKET',{index:true}],
  ['ANAR',{}],
  ['STARBURST',{thumb:true,index:true}],
  ['ROMAN_CANDLE',{index:true,middle:true}],
  ['PHOOLJHADI',{},h=>Object.assign(h,pinchHand())],
  ['GANGA_JAMUNA',{index:true,pinky:true}],
  ['CHAKRI',{thumb:true,index:true,middle:true,ring:true,pinky:true}],
  ['SUTLI_BOMB',{thumb:true,index:true,middle:true}],
  ['BULLET_BOMB',{thumb:true},h=>{h.landmarks[4].y=90;}]
 ]) clock(advance=>{
  const classifier=new GestureClassifier(),pose=hand(fingers);adjust?.(pose);pose.handedness=handedness;
  assert.deepEqual(classifier.classify([pose],1440),[],type);
  advance(251);
  const events=classifier.classify([pose],1440);
  assert.deepEqual(events.map(g=>g.type),[type]);
  assert.equal(events[0].handedness,handedness);
  if(type==='PHOOLJHADI')assert.deepEqual(events[0].triggerPoint,{x:90,y:125},'sparkler follows thumb/index contact');
 });
});

test('each hand has an independent pose, hold and cooldown', () => clock(advance=>{
 const classifier=new GestureClassifier(),left=hand({index:true,middle:true}),right={...hand({thumb:true,index:true,middle:true}),handedness:'Right'};
 classifier.classify([left],1440);advance(181);
 assert.deepEqual(classifier.classify([right,left],1440).map(g=>[g.type,g.handIndex]),[['ROMAN_CANDLE',0]]);
 advance(251);assert.deepEqual(classifier.classify([left,right],1440).map(g=>g.type),['SUTLI_BOMB']);
 advance(400);assert.deepEqual(classifier.classify([left,right],1440),[]);
 advance(251);assert.deepEqual(classifier.classify([left,right],1440).map(g=>g.type),['SUTLI_BOMB']);
 advance(401);assert.deepEqual(classifier.classify([right,left],1440).map(g=>g.type),['ROMAN_CANDLE']);
 advance(250);assert.deepEqual(classifier.classify([right],1440).map(g=>g.type),['SUTLI_BOMB']);
}));

test('two identical one-hand signs emit two independent crackers', () => clock(advance=>{
 const classifier=new GestureClassifier(),left=hand({index:true}),right={...hand({index:true}),handedness:'Right'};
 classifier.classify([left,right],1440);advance(181);
 assert.deepEqual(classifier.classify([right,left],1440).map(g=>[g.type,g.handIndex]),[['ROCKET',1],['ROCKET',0]]);
 assert.deepEqual(classifier.classify([left,right],1440),[]);
 advance(651);assert.equal(classifier.classify([left,right],1440).length,2);
}));

test('one hand disappearing clears only its hold and preserves the other continuous effect', () => clock(advance=>{
 const classifier=new GestureClassifier(),left=hand({index:true}),right={...pinchHand(),handedness:'Right'};
 classifier.classify([left,right],1440);advance(121);
 assert.deepEqual(classifier.classify([right],1440).map(g=>g.type),['PHOOLJHADI']);
 advance(1000);
 assert.deepEqual(classifier.classify([left,right],1440).map(g=>g.type),['PHOOLJHADI'],'returning left needs a new hold');
 advance(181);assert.deepEqual(classifier.classify([left,right],1440).map(g=>g.type),['ROCKET','PHOOLJHADI']);
}));

test('fist contact and uncertain joints cannot turn into another cracker', () => clock(advance=>{
 const classifier=new GestureClassifier(),fist=hand({});fist.isPinching=true;
 classifier.classify([fist],1440);advance(251);
 assert.deepEqual(classifier.classify([fist],1440).map(g=>g.type),['ANAR']);
 const uncertain=hand({index:true});uncertain.fingerStates={thumb:'folded',index:'extended',middle:'uncertain',ring:'folded',pinky:'folded'};
 assert.deepEqual(classifier.classify([uncertain],1440),[]);advance(500);
 assert.deepEqual(classifier.classify([uncertain],1440),[]);
}));

test('downward and sideways poses never launch crackers', () => {
 for(const fingers of [{index:true},{thumb:true,index:true},{index:true,middle:true},{index:true,pinky:true},{index:true,middle:true,ring:true,pinky:true},{thumb:true,index:true,middle:true,ring:true,pinky:true}]) {
  for(const direction of ['down','side'])clock(advance=>{
   const pose=hand(fingers),classifier=new GestureClassifier();
   for(const tip of [8,12,16,20]) {
    pose.landmarks[tip].y=direction==='down'?300:180;
    pose.landmarks[tip-2].y=direction==='down'?230:180;
   }
   classifier.classify([pose],1440);advance(1000);
   assert.deepEqual(classifier.classify([pose],1440),[]);
  });
 }
});

test('either familiar way of counting three triggers Sutli', () => {
 for(const fingers of [{thumb:true,index:true,middle:true},{index:true,middle:true,ring:true}])clock(advance=>{
  const pose=hand(fingers),classifier=new GestureClassifier();
  classifier.classify([pose],1440);advance(251);
  assert.deepEqual(classifier.classify([pose],1440).map(g=>g.type),['SUTLI_BOMB']);
 });
});

test('hold timing resets on a pose change and brief transitions cannot fire', () => clock(advance=>{
 const classifier=new GestureClassifier(),rocket=hand({index:true}),peace=hand({index:true,middle:true});
 classifier.classify([rocket],1440);advance(150);
 assert.deepEqual(classifier.classify([peace],1440),[]);advance(150);
 assert.deepEqual(classifier.classify([rocket],1440),[]);advance(181);
 assert.deepEqual(classifier.classify([rocket],1440).map(g=>g.type),['ROCKET']);
}));

test('joint geometry and pinch ratios are invariant to hand scale and rotation', () => {
 const points=Array.from({length:21},()=>({x:0,y:0,z:0}));
 points[0]={x:0,y:2,z:0};
 for(const [mcp,x]of [[5,-1],[9,0],[13,1],[17,2]]) {
  for(let j=0;j<4;j++)points[mcp+j]={x,y:-j,z:0};
 }
 points[2]={x:-1,y:1,z:0};points[3]={x:-2,y:1,z:0};points[4]={x:-3,y:1,z:0};
 const expected={index:'extended',middle:'extended',ring:'extended',pinky:'extended',thumb:'extended'};
 assert.deepEqual(fingerGeometry(points),expected);
 const ratio=pinchRatio(points);
 for(const scale of [.01,1,400]) {
  const transformed=points.map(p=>({x:(p.z+4)*scale,y:(p.x-2)*scale,z:(p.y+8)*scale}));
  assert.deepEqual(fingerGeometry(transformed),expected);
  assert.ok(Math.abs(pinchRatio(transformed)-ratio)<1e-10);
 }
 // Curl the index around its PIP. A degenerate hand is never interpreted as a pinch.
 points[7]={x:-.5,y:-.5,z:0};points[8]={x:-.5,y:0,z:0};
 assert.equal(fingerGeometry(points).index,'folded');
 assert.equal(pinchRatio(Array.from({length:21},()=>({x:0,y:0,z:0}))),Infinity);
});

test('rapid manual launches append same-type and mixed effects without replacing them', () => {
 const director=new FireworkDirector();director.pool.render=()=>{};
 director.ignite('ANAR',200,600,1280,720);
 director.ignite('ANAR',800,600,1280,720);
 director.ignite('PHOOLJHADI',1000,400,1280,720);
 director.ignite('ROCKET',600,600,1280,720);
 assert.equal(director.effects.length,4);
 director.handleGestures([],1280,720);
 director.updateAndRender(1/60,context);
 const sparks=director.pool.pool.filter(p=>p.active);
 assert.ok(sparks.some(p=>Math.abs(p.x-200)<20));
 assert.ok(sparks.some(p=>Math.abs(p.x-800)<20));
 assert.ok(sparks.some(p=>Math.abs(p.x-1000)<20));
 for(let frame=0;frame<720;frame++)director.updateAndRender(1/60,context);
 assert.equal(director.effects.length,0);assert.equal(director.pool.activeCount,0);
});

test('changing signs releases the hand-held fountain without a stationary ghost', () => {
 const director=new FireworkDirector();director.pool.render=()=>{};
 director.handleGestures([gesture('ANAR',true)],1280,720);
 const fountain=director.effects[0];
 for(let frame=0;frame<300;frame++)director.updateAndRender(1/60,context);
 assert.equal(fountain.active,true,'a held sign sustains the fountain');
 director.handleGestures([gesture('ROCKET')],1280,720);
 assert.equal(director.effects.length,2);
 for(let frame=0;frame<120;frame++)director.updateAndRender(1/60,context);
 assert.equal(fountain.active,false,'the previous hand-held source is no longer left burning');
 for(let frame=0;frame<600;frame++)director.updateAndRender(1/60,context);
 assert.equal(fountain.active,false);assert.equal(director.effects.length,0);assert.equal(director.pool.activeCount,0);
});

test('manual and hand-controlled fountains can coexist and expire independently', () => {
 const director=new FireworkDirector();director.pool.render=()=>{};
 director.ignite('ANAR',200,600,1280,720);
 const manual=director.effects[0];
 director.ignite('ANAR',800,600,1280,720);
 director.handleGestures([gesture('ANAR',true),{...gesture('PHOOLJHADI',true),handIndex:1}],1280,720);
 assert.equal(director.effects.length,3);
 for(let frame=0;frame<240;frame++)director.updateAndRender(1/60,context);
 assert.equal(manual.active,false);assert.equal(director.effects.length,2);
 director.handleGestures([],1280,720);
 for(let frame=0;frame<720;frame++)director.updateAndRender(1/60,context);
 assert.equal(director.effects.length,0);assert.equal(director.pool.activeCount,0);
});

test('a moving pinch updates the existing sparkler instead of creating stationary copies', () => clock(advance=>{
 const classifier=new GestureClassifier(),pose=pinchHand(),director=new FireworkDirector();director.pool.render=()=>{};
 classifier.classify([pose],1280);advance(121);
 let recognized=classifier.classify([pose],1280);
 director.handleGestures(recognized,1280,720,[pose]);director.updateAndRender(1/60,context);
 assert.equal(director.effects.length,1);
 director.pool.clear();shiftHand(pose,810,175);advance(50);
 recognized=classifier.classify([pose],1280);
 assert.deepEqual(recognized[0].triggerPoint,{x:900,y:300});
 director.handleGestures(recognized,1280,720,[pose]);director.updateAndRender(1/60,context);
 assert.equal(director.effects.length,1);
 const particles=director.pool.pool.filter(p=>p.active);
 assert.ok(particles.length>10);
 assert.ok(particles.every(p=>Math.abs(p.x-900)<40 && Math.abs(p.y-300)<40));
}));

test('brief pinch recognition gaps keep one sparkler following the palm, then expire promptly', () => {
 const director=new FireworkDirector();director.pool.render=()=>{};
 director.handleGestures([gesture('PHOOLJHADI',true)],1280,720);
 const held=director.effects[0],pose=pinchHand();shiftHand(pose,760,125);
 director.handleGestures([],1280,720,[pose]);director.updateAndRender(1/60,context);
 assert.ok(director.pool.pool.filter(p=>p.active).every(p=>Math.abs(p.x-850)<40));
 for(let i=0;i<7;i++) {director.handleGestures([],1280,720,[pose]);director.updateAndRender(1/60,context);}
 assert.equal(held.active,true);
 director.handleGestures([{...gesture('PHOOLJHADI',true),triggerPoint:{x:850,y:250}}],1280,720,[pose]);
 assert.equal(director.effects.length,1);
 for(let i=0;i<30;i++){director.handleGestures([],1280,720);director.updateAndRender(1/60,context);}
 assert.equal(held.active,false);assert.equal(director.continuousSparklers.size,0);
});

test('a pinch picks up the clicked sparkler instead of leaving a stationary duplicate', () => {
 const director=new FireworkDirector();director.pool.render=()=>{};
 director.ignite('PHOOLJHADI',200,300,1280,720);
 const clicked=director.effects[0];
 director.handleGestures([{...gesture('PHOOLJHADI',true),triggerPoint:{x:800,y:250}}],1280,720);
 director.updateAndRender(1/60,context);
 assert.equal(director.effects.length,1);assert.equal(director.effects[0],clicked);
 assert.ok(director.pool.pool.filter(p=>p.active).every(p=>Math.abs(p.x-800)<40));
 director.handleGestures([],1280,720);
 for(let i=0;i<30;i++)director.updateAndRender(1/60,context);
 assert.equal(clicked.active,false);
});

test('switching from a pinch to another sign extinguishes its attached sparkler', () => {
 const director=new FireworkDirector();director.pool.render=()=>{};
 director.handleGestures([gesture('PHOOLJHADI',true)],1280,720);
 const held=director.effects[0];
 director.handleGestures([gesture('ROCKET')],1280,720);
 assert.equal(held.active,false);
 director.updateAndRender(1/60,context);
 assert.equal(director.effects.length,1);
});

test('Ganga Jamuna is a sustained fountain, a brief pause, then one bang', () => {
 const events=[];const pool=new ParticlePool();
 const effect=new GangaJamuna(400,600,type=>events.push(type));
 for(let i=0;i<150;i++) {effect.update(1/60,pool);pool.update(1/60);}
 assert.ok(events.includes('ANAR_LOOP'));assert.ok(!events.includes('GANGA_BANG'));
 for(let i=0;i<60;i++) {effect.update(1/60,pool);pool.update(1/60);}
 assert.equal(events.filter(t=>t==='GANGA_BANG').length,1);assert.equal(effect.active,false);
});

test('bombs emit a fuse first and use different report events and delays', () => {
 for(const heavy of [false,true]) {
  const events=[];const effect=new Bomb(400,600,heavy,type=>events.push(type));const pool=new ParticlePool();
  assert.deepEqual(events,['FUSE']);
  for(let i=0;i<40;i++) effect.update(1/60,pool);
  assert.deepEqual(events,['FUSE']);
  for(let i=0;i<50;i++) effect.update(1/60,pool);
  assert.deepEqual(events,['FUSE',heavy?'SUTLI_BANG':'BULLET_BANG']);assert.equal(effect.active,false);
 }
});

test('Chakri finishes and stops requesting its loop', () => {
 let pulses=0;const effect=new Chakri(500,600,()=>pulses++);const pool=new ParticlePool();
 for(let i=0;i<300;i++) {effect.update(1/60,pool);pool.update(1/60);}
 assert.equal(effect.active,false);const previous=pulses;effect.update(1/60,pool);assert.equal(pulses,previous);
});

test('one second of simulation has the same motion at 30, 60, and 120 FPS', () => {
 const distances=[30,60,120].map(fps=>{
  const director=new FireworkDirector();director.pool.render=()=>{};
  const p=director.pool.spawn({x:0,y:0,vx:10,vy:0,color:{r:255,g:255,b:255},life:2,drag:1,gravity:0});
  for(let i=0;i<fps;i++) director.updateAndRender(1/fps,context);
  return p.x;
 });
 assert.deepEqual(distances,[600,600,600]);
});

test('particle slots can be fully exhausted, expired, and reused', () => {
 const pool=new ParticlePool();const config={x:0,y:0,vx:0,vy:0,color:{r:255,g:255,b:255},life:0.01};
 for(let i=0;i<7500;i++) assert.ok(pool.spawn(config));
 assert.equal(pool.spawn(config),null);pool.update(0.02);assert.equal(pool.activeCount,0);
 for(let i=0;i<7500;i++) assert.ok(pool.spawn(config));
 assert.equal(pool.activeCount,7500);pool.clear();assert.equal(pool.activeCount,0);assert.ok(pool.spawn(config));
});

test('particle rendering reuses spark stamps, batches trails, and culls off-screen sparks', () => {
 const originalDocument = globalThis.document;
 let stampFills=0,gradients=0,images=0,strokes=0;
 const offscreen={beginPath(){},arc(){},fill(){},fillRect(){stampFills++;},clearRect(){},
   createRadialGradient(){gradients++;return {addColorStop(){}};}};
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>offscreen})};
 try {
  const renderer=new ParticleRenderer();
  const color={r:255,g:215,b:0};
  const p={active:true,x:100,y:100,prevX:95,prevY:100,size:3,alpha:1,life:1,maxLife:2,color,fadeColor:color,trail:true};
  const particles=Array.from({length:300},(_,i)=>({...p,x:100+i,prevX:95+i}));
  particles.push({...p,x:950,prevX:945});
  const flashes=[{x:100,y:100,radius:300,alpha:.4,color},{x:102,y:100,radius:300,alpha:.3,color}];
  const ctx={save(){},restore(){},canvas:{width:800,height:600},getTransform:()=>({a:1}),
   drawImage(){images++;},beginPath(){},moveTo(){},lineTo(){},stroke(){strokes++;}};
  renderer.render(ctx,particles,flashes);
  assert.equal(images,301); // 300 visible heads and one combined ambient glow.
  assert.equal(strokes,1);
  assert.equal(stampFills,2); // One soft spark stamp and one ambient glow, both cached.
  renderer.render(ctx,particles,flashes);
  assert.equal(stampFills,2);
  assert.equal(gradients,2);
  assert.equal(images,602);
 } finally {globalThis.document=originalDocument;}
});

test('short audio reports start before their stop is scheduled', () => {
 const order=[];const source={playbackRate:{},connect(){},disconnect(){},start(){order.push('start');},stop(){assert.equal(order[0],'start');order.push('stop');}};
 const gain={gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};
 const audio=new PyroAudioEngine();audio.ctx={currentTime:0,createBufferSource:()=>source,createGain:()=>gain};audio.masterGain={};
 audio.buffers.set('SPARKLER',{});audio.playFuse();assert.deepEqual(order,['start','stop']);
});

test('capture blocks overlapping finalization, preserves shared audio, and matches the file extension', () => {
 const originalWindow=globalThis.window,originalStream=globalThis.MediaStream,originalRecorder=globalThis.MediaRecorder;
 let videoStopped=0,audioStopped=0,sharedStopped=0;
 const videoTrack={stop(){videoStopped++;}};
 const audioTrack={stop(){sharedStopped++;},clone(){return {stop(){audioStopped++;}};}};
 let recorder;
 globalThis.window={setInterval:()=>1,clearInterval(){}};
 globalThis.MediaStream=class {addTrack(){}};
 globalThis.MediaRecorder=class {
  static isTypeSupported(mime){return mime==='video/webm;codecs=vp8,opus';}
  constructor(_stream,options){this.mimeType=options.mimeType;this.state='inactive';recorder=this;}
  start(){this.state='recording';}stop(){this.state='inactive';}
 };
 try {
  const capture=new CaptureEngine({captureStream:()=>({getTracks:()=>[videoTrack],getVideoTracks:()=>[videoTrack]})});
  assert.equal(capture.startRecording(audioTrack),true);capture.stopRecording();assert.equal(capture.startRecording(audioTrack),false);
  recorder.ondataavailable({data:new Blob(['frames'],{type:recorder.mimeType})});recorder.onstop();
  assert.equal(capture.selectedExtension,'webm');assert.equal(videoStopped,1);assert.equal(audioStopped,1);assert.equal(sharedStopped,0);
  capture.dispose();
 } finally {globalThis.window=originalWindow;globalThis.MediaStream=originalStream;globalThis.MediaRecorder=originalRecorder;}
});


test('Retina drawing is sharper than CSS resolution and stays within the pixel budget', () => {
 for (const [width,height,dpr] of [[390,844,3],[1440,900,2],[1920,1080,2],[3840,2160,2]]) {
  const scale=renderScale(width,height,dpr);
  assert.ok(scale<=Math.min(2,dpr));
  assert.ok(width*height*scale*scale<=3686400.01);
  if(width<=1920)assert.ok(scale>1);
 }
 assert.equal(renderScale(1280,720,1),1);
});

test('smoke has a bounded budget, fades in and out, and releases its slots', () => {
 const pool=new ParticlePool();
 const config={x:0,y:0,vx:0,vy:-1,color:{r:255,g:188,b:84},size:15,life:2,kind:'smoke',opacity:.1};
 const first=pool.spawn(config);
 for(let i=1;i<192;i++) assert.ok(pool.spawn(config));
 assert.equal(pool.spawn(config),null);
 pool.update(.1);const early=first.alpha;
 pool.update(.9);assert.ok(first.alpha>early);
 pool.update(1.1);assert.equal(pool.activeCount,0);assert.ok(pool.spawn(config));
});

test('subtle torch flashes survive a paint interval and then decay completely', () => {
 const pool=new ParticlePool();
 pool.addFlash(0,0,120,{r:255,g:188,b:84},.025);
 pool.update(1/60);assert.equal(pool.flashes.length,1);
 for(let i=0;i<12;i++)pool.update(1/60);
 assert.equal(pool.flashes.length,0);
});

test('every cracker finishes with finite particle state and releases sparks and smoke', () => {
 const noop=()=>{};
 const gradient=()=>({addColorStop(){}});
 const drawing=new Proxy({createLinearGradient:gradient,createRadialGradient:gradient,createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})}, {get:(target,key)=>target[key]??noop});
 const originalDocument=globalThis.document;
 globalThis.document={createElement:()=>({width:256,height:256,getContext:()=>drawing})};
 try {
 for(const type of ['ROCKET','ANAR','STARBURST','ROMAN_CANDLE','PHOOLJHADI','GRAND_FINALE','GANGA_JAMUNA','CHAKRI','SUTLI_BOMB','BULLET_BOMB']) {
  const director=new FireworkDirector();director.pool.render=noop;
  director.ignite(type,640,520,1280,720);
  for(let frame=0;frame<720;frame++) {
   director.updateAndRender(1/60,drawing);
   if(frame%60===0) {
    const active=director.pool.pool.filter(p=>p.active);
    assert.equal(active.length,director.pool.activeCount,type);
    assert.ok(active.length<=7500,type);
    for(const p of active)for(const value of [p.x,p.y,p.vx,p.vy,p.life,p.size,p.heat,p.opacity,p.shutter])assert.ok(Number.isFinite(value),type);
   }
  }
  assert.equal(director.pool.activeCount,0,type);
  assert.equal(director.effects.length,0,type);
 }
 }finally{globalThis.document=originalDocument;}
});


class TestVideo extends EventTarget {
 readyState=2;videoWidth=640;videoHeight=480;paused=true;srcObject=null;
 play(){this.paused=false;return Promise.resolve();}
 pause(){this.paused=true;}
}
class TestCameraTrack extends EventTarget {
 readyState='live';muted=false;stopped=0;
 stop(){this.readyState='ended';this.stopped++;}
}
const cameraStream=track=>({getTracks:()=>[track],getVideoTracks:()=>[track]});

test('camera startup requests one stream for concurrent clicks and reuses it afterward', async()=>{
 const video=new TestVideo();const track=new TestCameraTrack();const stream=cameraStream(track);let requests=0;
 const camera=new CameraSession(video,async()=>{requests++;return stream;});
 const first=camera.start(),second=camera.start();assert.equal(first,second);
 assert.equal(await first,stream);assert.equal(camera.isReady,true);assert.equal(requests,1);
 assert.equal(await camera.start(),stream);assert.equal(requests,1);
 video.paused=true;assert.equal(await camera.start(),stream);assert.equal(requests,1);
 camera.stop();assert.equal(track.stopped,1);assert.equal(video.srcObject,null);
});

test('camera readiness waits for an actual decoded frame', async()=>{
 const video=new TestVideo();video.readyState=0;video.videoWidth=video.videoHeight=0;
 const track=new TestCameraTrack();const camera=new CameraSession(video,async()=>cameraStream(track));
 const opening=camera.start();await Promise.resolve();assert.equal(camera.isReady,false);
 video.readyState=2;video.videoWidth=640;video.videoHeight=480;video.dispatchEvent(new Event('loadeddata'));
 await opening;assert.equal(camera.isReady,true);camera.stop();
});

test('permission denial never enters an automatic request loop', async()=>{
 const video=new TestVideo();let requests=0;
 const camera=new CameraSession(video,async()=>{requests++;throw new DOMException('Denied','NotAllowedError');});
 await assert.rejects(camera.start(),{name:'NotAllowedError'});
 await Promise.resolve();assert.equal(requests,1);assert.equal(camera.isReady,false);assert.equal(video.srcObject,null);
});

test('a late permission response is released after the camera is cancelled', async()=>{
 const video=new TestVideo();const track=new TestCameraTrack();let grant;
 const camera=new CameraSession(video,()=>new Promise(resolve=>{grant=resolve;}));
 const opening=camera.start();camera.stop();grant(cameraStream(track));
 await assert.rejects(opening,{name:'AbortError'});assert.equal(track.stopped,1);assert.equal(video.srcObject,null);assert.equal(camera.isReady,false);
});

test('camera disconnection clears readiness and notifies the interface once', async()=>{
 const video=new TestVideo();const track=new TestCameraTrack();const states=[];
 const camera=new CameraSession(video,async()=>cameraStream(track));camera.onInterruption=state=>states.push(state);
 await camera.start();track.muted=true;track.dispatchEvent(new Event('mute'));
 assert.equal(camera.isMuted,true);track.muted=false;track.dispatchEvent(new Event('unmute'));
 track.readyState='ended';track.dispatchEvent(new Event('ended'));
 assert.deepEqual(states,['muted','resumed','ended']);assert.equal(camera.isReady,false);assert.equal(video.srcObject,null);
});

test('video playback failures release the stream rather than leaving a black camera active', async()=>{
 const video=new TestVideo();video.play=()=>Promise.reject(new DOMException('Decode failed','NotReadableError'));
 const track=new TestCameraTrack();const camera=new CameraSession(video,async()=>cameraStream(track));
 await assert.rejects(camera.start(),{name:'NotReadableError'});assert.equal(track.stopped,1);assert.equal(video.srcObject,null);
});

test('camera preference only permits automatic resume for an existing browser grant', async()=>{
 const store=new Map();const storage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
 assert.equal(cameraWasEnabled(storage),false);rememberCamera(true,storage);assert.equal(cameraWasEnabled(storage),true);
 for(const state of ['granted','prompt','denied']) {
  const permissions={query:async()=>({state})};
  assert.equal(await mayResumeCamera(cameraWasEnabled(storage),permissions),state==='granted');
 }
 rememberCamera(false,storage);
 let queried=false;
 assert.equal(await mayResumeCamera(cameraWasEnabled(storage),{query:async()=>{queried=true;return {state:'granted'};}}),false);
 assert.equal(queried,false);
});

test('unsupported permission queries and private storage never trigger automatic camera access', async()=>{
 assert.equal(await mayResumeCamera(true),false);
 assert.equal(await mayResumeCamera(true,{query:async()=>{throw new TypeError('Unsupported');}}),false);
 const blocked={getItem(){throw new Error('Blocked');},setItem(){throw new Error('Blocked');}};
 rememberCamera(true,blocked);assert.equal(cameraWasEnabled(blocked),false);
 assert.match(cameraErrorMessage(new DOMException('Denied','NotAllowedError')),/blocked/);
 assert.match(cameraErrorMessage(new DOMException('Missing','NotFoundError')),/No camera/);
});


test('weak devices start with bounded low-cost profiles and unknown devices retain detail', () => {
 assert.equal(startingQuality({cores:2}),0);assert.equal(startingQuality({memory:2}),0);
 assert.equal(startingQuality({saveData:true}),0);assert.equal(startingQuality({cores:4,memory:8}),1);
 assert.equal(startingQuality({cores:8,memory:8}),2);assert.equal(startingQuality({}),2);
 for(const profile of QUALITY) {
  const scale=renderScale(1920,1080,2,profile.pixels);
  assert.ok(1920*1080*scale*scale<=profile.pixels+.01);
 }
});

test('sustained slow rendering drops budgets, and recovery is gradual', () => {
 const quality=new AdaptiveQuality({cores:8,memory:8});let now=1;
 for(let i=0;i<120;i++){now+=40;quality.sample(now,40,22,true);}
 assert.equal(quality.profile.name,'low');
 for(let i=0;i<60;i++){now+=33.33;quality.sample(now,33.33,2,true);}
 assert.equal(quality.profile.name,'low','one healthy window is insufficient');
 for(let i=0;i<700;i++){now+=1000/quality.profile.fps;quality.sample(now,1000/quality.profile.fps,2,true);}
 assert.ok(quality.level>0);
 const forced=new AdaptiveQuality({},0);
 for(let i=0;i<200;i++)forced.sample(i*50,50,40,true);
 assert.equal(forced.level,0);
});

test('reducing the particle budget thins all live effects and keeps every pool slot reusable', () => {
 const pool=new ParticlePool(),config={x:0,y:0,vx:1,vy:0,color:{r:255,g:255,b:255},life:.02};
 for(let i=0;i<7500;i++)pool.spawn(config);
 pool.setBudget(QUALITY[0]);assert.equal(pool.activeCount,1600);
 assert.equal(pool.pool.filter(p=>p.active).length,1600);
 pool.update(.1);assert.equal(pool.activeCount,0);
 pool.setBudget(QUALITY[2]);
 for(let i=0;i<7500;i++)assert.ok(pool.spawn(config));
 assert.equal(pool.activeCount,7500);assert.equal(pool.spawn(config),null);
 pool.clear();assert.equal(pool.activeCount,0);
 const smoky=new ParticlePool();
 for(let i=0;i<192;i++)smoky.spawn({...config,life:2,kind:'smoke'});
 smoky.setBudget(QUALITY[0]);assert.ok(smoky.pool.filter(p=>p.active&&p.kind==='smoke').length<=16);
});

test('low-cost emission and smoke stay bounded while rendering scans only live particles', () => {
 const pool=new ParticlePool(),config={x:0,y:0,vx:1,vy:0,color:{r:255,g:255,b:255},life:1};
 pool.setBudget(QUALITY[0]);
 for(let i=0;i<100;i++)pool.spawn(config);
 assert.ok(pool.activeCount>=30 && pool.activeCount<=33);
 for(let i=0;i<300;i++)pool.spawn({...config,kind:'smoke'});
 assert.ok(pool.pool.filter(p=>p.active&&p.kind==='smoke').length<=16);
 let visited=0;pool.renderer={render:(_ctx,particles)=>{visited=particles.length;}};
 pool.render(context);assert.equal(visited,pool.activeCount);assert.ok(visited<100);
});

test('background tracking has one frame in flight and consumes discrete results only once', async()=>{
 const originalBitmap=globalThis.createImageBitmap;
 let captures=0,complete,closed=0;
 globalThis.createImageBitmap=()=>{captures++;return new Promise(resolve=>{complete=resolve;});};
 try {
  const engine=new VisionEngine(),messages=[];
  engine.worker={postMessage:m=>messages.push(m)};engine.isReady=true;
  engine.detectionInterval=0;
  const camera=video();
  engine.update(camera,1280,720);camera.currentTime++;
  engine.update(camera,1280,720);assert.equal(captures,1);
  complete({close(){closed++;}});await Promise.resolve();
  assert.equal(messages.length,1);assert.equal(messages[0].type,'frame');
  engine.framePending=false;engine.activeGestures=[gesture('ROCKET'),gesture('PHOOLJHADI',true)];engine.freshResult=true;engine.lastResult=engine.lastCapture=performance.now();
  assert.deepEqual(engine.update(camera,1280,720).map(g=>g.type),['ROCKET','PHOOLJHADI']);
  assert.deepEqual(engine.update(camera,1280,720).map(g=>g.type),['PHOOLJHADI']);
  assert.equal(closed,0,'ownership was transferred to the worker');
  engine.resetTracking();complete({close(){closed++;}});await Promise.resolve();
  assert.equal(closed,1,'a cancelled bitmap is released');
 }finally{globalThis.createImageBitmap=originalBitmap;}
});

test('worker startup coalesces, applies results, and cancellation cannot restart tracking', async()=>{
 const originals={Worker:globalThis.Worker,OffscreenCanvas:globalThis.OffscreenCanvas,createImageBitmap:globalThis.createImageBitmap,window:globalThis.window};
 let worker,terminated=0,respond=true;
 globalThis.Worker=class {
  constructor(){worker=this;}
  postMessage(message){if(message.type==='init'&&respond)queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));}
  terminate(){terminated++;}
 };
 globalThis.OffscreenCanvas=class {};
 globalThis.createImageBitmap=()=>Promise.resolve({close(){}});
 globalThis.window={location:{origin:'http://localhost'}};
 try{
  const engine=new VisionEngine(),first=engine.init();assert.equal(first,engine.init());await first;
  assert.equal(engine.mode,'worker');assert.equal(engine.isReady,true);
  engine.classifier={classify:()=>[gesture('ROCKET')]};
  worker.onmessage({data:{type:'result',epoch:engine.epoch,result:{landmarks:[],handedness:[]},width:640,height:480,cost:10}});
  assert.equal(engine.activeGestures[0].type,'ROCKET');
  engine.activeGestures=[];
  worker.onmessage({data:{type:'result',epoch:engine.epoch,result:{landmarks:[],handedness:[]},width:640,height:480,cost:10,timestamp:performance.now()-300}});
  assert.deepEqual(engine.activeGestures,[],'late frames cannot ignite an old pose');
  assert.equal(engine.diagnostics.dropped,1);
  engine.resetTracking();
  worker.onmessage({data:{type:'result',epoch:engine.epoch-1,result:{landmarks:[],handedness:[]},width:640,height:480,cost:10}});
  assert.deepEqual(engine.activeGestures,[],'old camera results are discarded');
  engine.pause();assert.equal(engine.isReady,false);assert.equal(terminated,1);
  respond=false;
  const pending=engine.init();engine.pause();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(engine.isReady,false);assert.equal(terminated,2);
 }finally{for(const [name,value]of Object.entries(originals))globalThis[name]=value;}
});


test('unsupported background tracking falls back to a paced main-thread tracker', async()=>{
 const previous=globalThis.window;globalThis.window={location:{origin:'http://localhost'}};
 try{
  const engine=new VisionEngine();await engine.init();
  assert.equal(engine.mode,'main');assert.equal(engine.isReady,true);
  engine.setTrackingRate(15);assert.ok(engine.detectionInterval>=1000/15);
  assert.deepEqual(engine.update(video(),1280,720),[]);engine.pause();assert.equal(engine.isReady,false);
 }finally{globalThis.window=previous;}
});


test('a clicked Anar is adopted and follows its hand through recognition gaps', () => {
 const director=new FireworkDirector();director.pool.render=()=>{};
 director.ignite('ANAR',200,600,1280,720);
 const clicked=director.effects[0],pose=hand({});
 director.handleGestures([{...gesture('ANAR',true),triggerPoint:{x:800,y:400}}],1280,720,[pose]);
 director.updateAndRender(1/60,context);assert.equal(director.effects.length,1);assert.equal(director.effects[0],clicked);
 director.pool.clear();pose.palmCenter={x:1000,y:300,z:0};
 director.handleGestures([],1280,720,[pose]);director.updateAndRender(1/60,context);
 assert.ok(director.pool.pool.filter(p=>p.active).every(p=>Math.abs(p.x-1000)<40));
 director.handleGestures([{...gesture('ANAR',true),triggerPoint:{x:850,y:250}}],1280,720,[pose]);
 assert.equal(director.effects.length,1);
 director.handleGestures([],1280,720);
 for(let i=0;i<30;i++)director.updateAndRender(1/60,context);
 assert.equal(clicked.active,false);
});

test('finite fountains, wheels, bomb fuses and candle launchers follow held signs during cooldown', () => {
 for(const type of ['GANGA_JAMUNA','CHAKRI','SUTLI_BOMB','BULLET_BOMB','ROMAN_CANDLE']) {
  const director=new FireworkDirector();director.pool.render=()=>{};
  director.ignite(type,200,500,1280,720);
  const object=director.effects[0];object.render=()=>{};
  const pose=hand({});pose.heldGesture={type,triggerPoint:{x:800,y:400}};
  director.handleGestures([{...gesture(type),triggerPoint:pose.heldGesture.triggerPoint}],1280,720,[pose]);
  assert.equal(director.effects.length,1,type+' picks up the clicked object');
  pose.heldGesture.triggerPoint={x:1000,y:300};
  director.handleGestures([],1280,720,[pose]);
  for(let i=0;i<16;i++){director.handleGestures([],1280,720,[pose]);director.updateAndRender(1/60,context);}
  assert.ok(director.pool.pool.some(p=>p.active&&Math.abs(p.x-1000)<50),type+' emits at the moved position');
  assert.equal(director.effects.length,1,type+' does not recreate objects to move them');
 }
});

test('phone camera fills the entire stage in either orientation with matching hand coordinates', () => {
 for(const [width,height] of [[320,568],[390,844],[430,932],[844,390]]) {
  for(const [videoW,videoH]of [[640,480],[480,640]]) {
   const frame=coverTransform(videoW,videoH,width,height);
   assert.ok(frame.x<=.001 && frame.y<=.001);
   assert.ok(frame.x+frame.width>=width-.001);
   assert.ok(frame.y+frame.height>=height-.001);
   const engine=fakeEngine([]);
   engine.update({...video(),videoWidth:videoW,videoHeight:videoH},width,height);
   assert.equal(engine.detectedHands[0].landmarks[8].x,width-(frame.x+.25*frame.width));
   assert.equal(engine.detectedHands[0].landmarks[8].y,frame.y+.25*frame.height);
  }
 }
 assert.equal(cameraConstraints(390,844).aspectRatio.ideal,.75);
 assert.equal(cameraConstraints(844,390).aspectRatio.ideal,4/3);
 assert.equal(cameraConstraints(390,844).resizeMode.ideal,'none');
});

test('fullscreen enters before locking landscape and can exit', async () => {
 const calls=[];const doc={fullscreenEnabled:true,fullscreenElement:null,exitFullscreen:async()=>{calls.push('exit');doc.fullscreenElement=null;}};
 const target={requestFullscreen:async options=>{assert.equal(options.navigationUI,'hide');calls.push('enter');doc.fullscreenElement=target;}};
 const orientation={lock:async mode=>{assert.ok(isFullscreen(doc));calls.push(mode);},unlock:()=>calls.push('unlock')};
 assert.equal(await enterFullscreen(target,doc,orientation),'entered');
 assert.deepEqual(calls,['enter','landscape']);
 await leaveFullscreen(doc,orientation);
 assert.equal(isFullscreen(doc),false);
 assert.deepEqual(calls,['enter','landscape','exit','unlock']);
});

test('unsupported and rejected fullscreen never attempts orientation lock', async () => {
 const orientation={lock:async()=>assert.fail('must not lock without fullscreen')};
 assert.equal(await enterFullscreen({}, {},orientation),'unavailable');
 assert.equal(await enterFullscreen({requestFullscreen:async()=>assert.fail('disabled')},{fullscreenEnabled:false},orientation),'unavailable');
 assert.equal(await enterFullscreen({requestFullscreen:async()=>{throw new Error('blocked');}},{fullscreenEnabled:true},orientation),'rejected');
});

test('orientation lock failure keeps successful fullscreen and supports prefixed browsers', async () => {
 const target={webkitRequestFullscreen(){assert.equal(this,target);doc.webkitFullscreenElement=target;}};
 const doc={webkitFullscreenEnabled:true,webkitExitFullscreen(){assert.equal(this,doc);doc.webkitFullscreenElement=null;}};
 assert.equal(await enterFullscreen(target,doc,{lock:async()=>{throw new Error('unsupported');}}),'entered');
 assert.equal(isFullscreen(doc),true);
 await leaveFullscreen(doc);
 assert.equal(isFullscreen(doc),false);
});

test('rotation reframes the existing camera once per orientation without another media request', async () => {
 const constraints=[];let requests=0;
 const camera=new CameraSession({},async()=>{requests++;throw new Error('must reuse stream');});
 camera.stream={getVideoTracks:()=>[{readyState:'live',applyConstraints:async value=>constraints.push(value)}]};
 camera.framingPortrait=true;
 await camera.updateFraming(844,390);
 await camera.updateFraming(850,390);
 await camera.updateFraming(390,844);
 assert.equal(requests,0);
 assert.deepEqual(constraints.map(c=>c.aspectRatio.ideal),[4/3,.75]);
 camera.stream={getVideoTracks:()=>[{readyState:'live',applyConstraints:async()=>{throw new Error('device rejected');}}]};
 await camera.updateFraming(844,390);
 assert.ok(camera.stream,'rejected constraints do not close the camera');
});

function mockAudio({deferDecode=false}={}) {
 const originalWindow=globalThis.window,originalFetch=globalThis.fetch;
 let context,starts=0,resumes=0;const decoders=[];
 const param=()=>({value:0,setValueAtTime(){},setTargetAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 const gain=()=>({gain:param(),connect(){},disconnect(){}});
 globalThis.window={setInterval:()=>1,AudioContext:class {
  constructor(){context=this;this.state='suspended';this.currentTime=0;this.destination={};}
  resume(){resumes++;this.state='running';this.onstatechange?.();return Promise.resolve();}
  createGain(){return gain();}
  createDynamicsCompressor(){return {threshold:{},knee:{},ratio:{},attack:{},release:{},connect(){}};}
  createMediaStreamDestination(){return {stream:{getAudioTracks:()=>[]}};}
  decodeAudioData(){return deferDecode?new Promise(resolve=>decoders.push(resolve)):Promise.resolve({});}
  createBufferSource(){return {playbackRate:{},connect(){},disconnect(){},start(){starts++;},stop(){}};}
 }};
 globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
 return {get context(){return context;},get starts(){return starts;},get resumes(){return resumes;},
  decode(){for(const resolve of decoders)resolve({});},
  restore(){globalThis.window=originalWindow;globalThis.fetch=originalFetch;}};
}
const audioTick=()=>new Promise(resolve=>setImmediate(resolve));

test('the first audio activation resumes the context and preserves the initial sound', async()=>{
 const mock=mockAudio();
 try {
  const engine=new PyroAudioEngine();engine.prepare();assert.equal(engine.needsActivation,true);
  engine.unlock();engine.playRomanPop();
  assert.equal(mock.resumes,1);assert.equal(engine.isMuted,false);
  await audioTick();assert.equal(mock.starts,1);assert.equal(engine.needsActivation,false);
  mock.context.state='interrupted';engine.unlock();assert.equal(mock.resumes,2);
  engine.playRomanPop();assert.equal(mock.starts,2);
  mock.context.state='interrupted';engine.resumeIfActivated();assert.equal(mock.resumes,3);
 }finally{mock.restore();}
});

test('pending first sounds are coalesced and explicit mute is respected while decoding', async()=>{
 const mock=mockAudio({deferDecode:true});
 try {
  const engine=new PyroAudioEngine();engine.unlock();engine.playRomanPop();engine.playRomanPop();
  await audioTick();mock.decode();await audioTick();assert.equal(mock.starts,1,'a loading sound does not replay a backlog');
  const next=new PyroAudioEngine();next.unlock();next.playRomanPop();next.toggleMute();
  await audioTick();mock.decode();await audioTick();assert.equal(mock.starts,1,'muting cancels queued playback');
  next.unlock();assert.equal(next.isMuted,true,'unrelated taps preserve the explicit mute choice');
 }finally{mock.restore();}
});

test('continuous sounds start automatically once their initial recording is decoded', async()=>{
 const mock=mockAudio({deferDecode:true});
 try {
  const engine=new PyroAudioEngine();engine.unlock();engine.pulseAnarLoop();assert.equal(mock.starts,0);
  await audioTick();mock.decode();await audioTick();engine.pulseAnarLoop();
  assert.equal(mock.starts,1);assert.equal(engine.isMuted,false);
 }finally{mock.restore();}
});


test('a finite fountain reconnects to its moving sign after a tracking gap without refiring', () => {
 const director=new FireworkDirector();director.pool.render=()=>{};
 const pose=hand({});pose.heldGesture={type:'GANGA_JAMUNA',triggerPoint:{x:200,y:400}};
 director.handleGestures([{...gesture('GANGA_JAMUNA'),triggerPoint:pose.heldGesture.triggerPoint}],1280,720,[pose]);
 const object=director.effects[0];object.render=()=>{};
 for(let i=0;i<30;i++){director.handleGestures([],1280,720);director.updateAndRender(1/60,context);}
 director.pool.clear();pose.heldGesture.triggerPoint={x:900,y:300};
 director.handleGestures([],1280,720,[pose]);director.updateAndRender(1/60,context);
 assert.equal(director.effects.length,1);assert.equal(director.effects[0],object);
 assert.ok(director.pool.pool.filter(p=>p.active).every(p=>Math.abs(p.x-900)<50));
});


test('two open palms trigger the finale without requiring a precisely extended thumb', () => clock(advance=>{
 const classifier=new GestureClassifier(),fingers={index:true,middle:true,ring:true,pinky:true};
 const left=hand(fingers),right={...hand(fingers),handedness:'Right'};
 left.fingerStates={thumb:'uncertain',index:'extended',middle:'extended',ring:'extended',pinky:'uncertain'};
 assert.deepEqual(classifier.classify([left,right],1280),[]);advance(301);
 assert.deepEqual(classifier.classify([right,left],1280).map(g=>g.type),['GRAND_FINALE']);
 advance(100);assert.deepEqual(classifier.classify([left],1280),[],'a dropping hand does not immediately light a Chakri');
}));

test('holding one open palm or three fingers creates overlapping Chakris and Sutli bombs', () => {
 for(const [type,fingers]of [['CHAKRI',{index:true,middle:true,ring:true,pinky:true}],['SUTLI_BOMB',{thumb:true,index:true,middle:true}]])clock(advance=>{
  const classifier=new GestureClassifier(),pose=hand(fingers),director=new FireworkDirector();
  director.pool.render=()=>{};classifier.classify([pose],1280);advance(251);let peak=0;
  for(let i=0;i<3;i++) {
   const events=classifier.classify([pose],1280);assert.deepEqual(events.map(g=>g.type),[type]);
   director.handleGestures(events,1280,720,[pose]);peak=Math.max(peak,director.effects.length);
   for(const effect of director.effects)effect.render=()=>{};
   for(let frame=0;frame<39;frame++)director.updateAndRender(1/60,context);
   advance(651);
  }
  assert.ok(peak>=2,type+' instances coexist during their actual burn/fuse lifetimes');
 });
});

test('Bullet uses a substantial report while Sutli retains a longer, deeper and louder mix', () => {
 const audio=new PyroAudioEngine(),calls=[];
 audio.playSample=(...args)=>calls.push(args);audio.playExplosion=power=>calls.push(['EXPLOSION',power]);
 audio.playBomb(false);const bullet=calls.splice(0);
 assert.ok(bullet.some(c=>c[0]==='HEAVY_EXPLOSION'));
 const bulletCrack=bullet.find(c=>c[0]==='THUNDER_CRACK');assert.ok(bulletCrack[1]>=.7);
 audio.playBomb(true);const sutliCrack=calls.find(c=>c[0]==='THUNDER_CRACK');
 assert.ok(sutliCrack[1]>bulletCrack[1]);assert.ok(sutliCrack[3]>bulletCrack[3]);assert.ok(sutliCrack[4]<bulletCrack[4]);
});


test('a thumb/index pinch works above or to the side of the knuckles without requiring other raised fingers', () => {
 for(const point of [{x:90,y:125},{x:50,y:180}])clock(advance=>{
  const pose=pinchHand(),classifier=new GestureClassifier();
  pose.landmarks[4]={...point,z:0};pose.landmarks[8]={...point,z:0};
  classifier.classify([pose],1280);advance(121);
  assert.deepEqual(classifier.classify([pose],1280).map(g=>g.type),['PHOOLJHADI']);
 });
});

test('OK contact tolerates depth error and small fingertip jitter, then releases cleanly', () => {
 const pose=pinchHand(),marks=pose.landmarks;
 marks[4].z=-50;marks[8].z=50;
 assert.equal(pinchContact(marks),true,'visible contact survives uncertain model depth');
 const palm=Math.max(Math.hypot(marks[0].x-marks[9].x,marks[0].y-marks[9].y),Math.hypot(marks[5].x-marks[17].x,marks[5].y-marks[17].y));
 marks[8].x=marks[4].x+palm*.34;
 assert.equal(pinchContact(marks),false,'separated tips cannot start a pinch');
 assert.equal(pinchContact(marks,true),true,'an existing contact does not flicker with a small gap');
 marks[8].x=marks[4].x+palm*.45;
 assert.equal(pinchContact(marks,true),false,'opening the fingers releases the pinch');
 assert.equal(pinchContact(Array.from({length:21},()=>({x:0,y:0,z:0}))),false);
});

test('a natural OK sign works at knuckle height and a fist remains Anar', () => clock(advance=>{
 const pose=hand({middle:true,ring:true,pinky:true}),classifier=new GestureClassifier();
 pose.fingerStates={thumb:'uncertain',index:'folded',middle:'uncertain',ring:'uncertain',pinky:'uncertain'};
 pose.isPinching=true;pose.landmarks[4]={x:90,y:180,z:0};pose.landmarks[8]={x:90,y:180,z:0};
 classifier.classify([pose],1280);advance(71);
 assert.deepEqual(classifier.classify([pose],1280).map(g=>g.type),['PHOOLJHADI']);
 const fist=hand({});fist.isPinching=true;
 classifier.classify([fist],1280);advance(181);
 assert.deepEqual(classifier.classify([fist],1280).map(g=>g.type),['ANAR']);
}));

function rotatePalm(pose,degrees) {
 const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),center=pose.palmCenter;
 pose.landmarks=pose.landmarks.map(p=>({x:center.x+(p.x-center.x)*c-(p.y-center.y)*s,y:center.y+(p.x-center.x)*s+(p.y-center.y)*c,z:p.z}));
 return pose;
}

test('spread and tilted palms work despite uncertain world joints, while three fingers stay Sutli', () => {
 for(const angle of [-55,-30,0,30,55])clock(advance=>{
  const palm=rotatePalm(hand({index:true,middle:true,ring:true,pinky:true}),angle),classifier=new GestureClassifier();
  palm.fingerStates={thumb:'uncertain',index:'uncertain',middle:'extended',ring:'folded',pinky:'uncertain'};
  classifier.classify([palm],1280);advance(221);
  assert.deepEqual(classifier.classify([palm],1280).map(g=>g.type),['CHAKRI'],String(angle));
 });
 clock(advance=>{
  const three=hand({index:true,middle:true,ring:true}),classifier=new GestureClassifier();
  classifier.classify([three],1280);advance(251);
  assert.deepEqual(classifier.classify([three],1280).map(g=>g.type),['SUTLI_BOMB']);
 });
});

test('two relaxed tilted palms remain a finale rather than two wheels', () => clock(advance=>{
 const left=rotatePalm(hand({index:true,middle:true,ring:true,pinky:true}),-45);
 const right=rotatePalm(hand({index:true,middle:true,ring:true,pinky:true}),45);right.handedness='Right';
 const classifier=new GestureClassifier();classifier.classify([left,right],1280);advance(301);
 assert.deepEqual(classifier.classify([left,right],1280).map(g=>g.type),['GRAND_FINALE']);
}));

test('moving hand prediction removes a frame of translation delay without changing the recognized shape', () => {
 const motion=new HandMotion(),first=pinchHand(),next=pinchHand();shiftHand(next,20,10);
 next.heldGesture={type:'PHOOLJHADI',triggerPoint:{x:110,y:135}};
 motion.observe([first],1000);motion.observe([next],1050);
 const projected=motion.project([next],1080)[0];
 assert.equal(projected.palmCenter.x,next.palmCenter.x+12);
 assert.equal(projected.palmCenter.y,next.palmCenter.y+6);
 assert.deepEqual(projected.heldGesture.triggerPoint,{x:122,y:141});
 assert.equal(projected.landmarks[4].x-projected.landmarks[8].x,next.landmarks[4].x-next.landmarks[8].x,'prediction cannot invent contact');
 assert.equal(next.palmCenter.x,140,'observed poses are not mutated');
 const late=motion.project([next],1400)[0];
 assert.ok(Math.hypot(late.palmCenter.x-next.palmCenter.x,late.palmCenter.y-next.palmCenter.y)<=36,'prediction stays bounded even if input pauses');
 motion.observe([next],1100);
 assert.equal(motion.project([next],1130)[0].palmCenter.x,next.palmCenter.x,'a stopped hand does not keep drifting');
 motion.observe([],1150);assert.deepEqual(motion.project([],1200),[]);
});

test('prediction reverses promptly, resets after gaps and does not cross a new hand', () => {
 const motion=new HandMotion(),first=pinchHand(),next=pinchHand();shiftHand(next,20,0);
 motion.observe([first],1000);motion.observe([next],1050);motion.observe([first],1100);
 assert.ok(motion.project([first],1130)[0].palmCenter.x<first.palmCenter.x);
 motion.observe([next],1500);
 assert.equal(motion.project([next],1530)[0].palmCenter.x,next.palmCenter.x,'no velocity bridges a long tracking gap');
 motion.reset();motion.observe([first],1600);
 assert.equal(motion.project([first],1630)[0].palmCenter.x,first.palmCenter.x);
});

test('stalled camera frames stop sustaining gestures even in the main-thread fallback', () => clock(advance=>{
 const engine=fakeEngine([gesture('PHOOLJHADI',true)]),camera=video();
 assert.equal(engine.update(camera,1280,720).length,1);
 advance(260);
 assert.deepEqual(engine.update(camera,1280,720),[]);
 assert.deepEqual(engine.detectedHands,[]);
}));

test('cold inference has a warm-up allowance and returning from background resets the watchdog', () => clock(advance=>{
 const engine=new VisionEngine();engine.worker={};engine.isReady=true;
 engine.framePending=true;engine.pendingSince=performance.now();
 advance(4000);
 assert.doesNotThrow(()=>engine.update(video(),1280,720),'cold model warm-up is not a three-second failure');
 engine.lastResult=engine.lastCapture=performance.now();engine.pendingSince=performance.now();
 advance(4000);
 const previousEpoch=engine.epoch;
 engine.resumeAfterVisibility();
 assert.equal(engine.epoch,previousEpoch+1,'background results cannot revive the old gesture');
 assert.doesNotThrow(()=>engine.update(video(),1280,720),'background suspension is not a new tracking failure');
 advance(8100);
 assert.throws(()=>engine.update(video(),1280,720),/stopped responding/,'a genuinely stuck worker is still reported');
}));

test('camera-frame callbacks feed tracking independently of painting and coalesce busy frames', async()=>{
 const originalBitmap=globalThis.createImageBitmap;
 let captures=0,callback,callbackId=0,cancelled=0;
 const messages=[];
 globalThis.createImageBitmap=async()=>{captures++;return {close(){}};};
 const engine=new VisionEngine();engine.worker={postMessage:message=>messages.push(message),terminate(){}};engine.isReady=true;engine.detectionInterval=0;
 const camera={...video(),requestVideoFrameCallback(fn){callback=fn;return ++callbackId;},cancelVideoFrameCallback(){cancelled++;}};
 try {
  engine.update(camera,1280,720);
  assert.equal(captures,0,'animation ticks do not submit duplicate camera frames');
  callback(0,{mediaTime:1});await Promise.resolve();
  assert.equal(captures,1);assert.equal(messages.length,1);
  callback(0,{mediaTime:2});callback(0,{mediaTime:3});
  assert.equal(captures,1,'there is still only one frame in flight');
  engine.framePending=false;
  engine.captureLatest(camera,performance.now(),engine.sourceFrameTime);await Promise.resolve();
  assert.equal(captures,2);assert.equal(engine.lastVideoTime,3,'only the newest pending camera frame survives');
  engine.framePending=false;engine.captureLatest(camera,performance.now(),3);
  assert.equal(captures,2,'one presented frame cannot be inferred twice');
  engine.pause();assert.equal(cancelled,1);
  callback(0,{mediaTime:4});assert.equal(captures,2,'callbacks cannot restart a paused tracker');
 }finally {globalThis.createImageBitmap=originalBitmap;}
});

test('graphics budgets give priority to tracking latency even when painting looks healthy',()=>{
 const quality=new AdaptiveQuality({cores:8,memory:8});
 let now=1000;
 for(let i=0;i<125;i++){now+=1000/60;quality.sample(now,1000/60,1,true,110);}
 assert.equal(quality.profile.name,'balanced','slow background inference lowers graphics pressure');
 for(let i=0;i<125;i++){now+=1000/60;quality.sample(now,1000/60,1,true,110);}
 assert.equal(quality.profile.name,'low');
 for(let i=0;i<800;i++){now+=1000/30;quality.sample(now,1000/30,1,true,70);}
 assert.equal(quality.profile.name,'low','fast painting alone cannot raise budgets while input is slow');
});

test('slow but current inference remains usable within a bounded freshness window', () => clock(advance=>{
 const engine=fakeEngine([gesture('PHOOLJHADI',true)]),camera=video();
 engine.update(camera,1280,720);engine.inferenceMs=280;
 advance(300);
 assert.equal(engine.diagnostics.fresh,true,'a slow device does not reject every otherwise current result');
 assert.equal(engine.update(camera,1280,720).length,1);
 advance(310);
 assert.deepEqual(engine.update(camera,1280,720),[],'no device can sustain poses beyond 600 ms');
 assert.equal(engine.diagnostics.fresh,false);
}));

test('an exposed but silent video callback API falls back to polling and recovers without duplicate frames', async()=>{
 const previousPerformance=globalThis.performance,previousBitmap=globalThis.createImageBitmap;
 let now=10000,captures=0,callback;
 Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});
 globalThis.createImageBitmap=async()=>{captures++;return {close(){}};};
 try {
  const engine=new VisionEngine();engine.worker={postMessage(){}};engine.isReady=true;engine.detectionInterval=0;
  const camera={...video(),requestVideoFrameCallback(fn){callback=fn;return 1;},cancelVideoFrameCallback(){}};
  engine.update(camera,1280,720);assert.equal(captures,0);
  now+=199;engine.update(camera,1280,720);assert.equal(captures,0);
  now+=2;engine.update(camera,1280,720);await Promise.resolve();
  assert.equal(captures,1);assert.equal(engine.diagnostics.frameSource,'polling');
  engine.framePending=false;now+=50;engine.update(camera,1280,720);
  assert.equal(captures,1,'a frozen camera clock does not enqueue duplicate frames');
  camera.currentTime=2;engine.update(camera,1280,720);await Promise.resolve();
  assert.equal(captures,2);
  engine.framePending=false;
  callback(now,{mediaTime:2});
  assert.equal(captures,2,'resuming callbacks cannot reprocess the polling frame');
  assert.equal(engine.diagnostics.frameSource,'video');
 }finally {
  globalThis.createImageBitmap=previousBitmap;
  Object.defineProperty(globalThis,'performance',{value:previousPerformance,configurable:true});
 }
});

test('a throwing video callback API falls back to polling immediately', async()=>{
 const previous=globalThis.createImageBitmap;let captures=0;
 globalThis.createImageBitmap=async()=>{captures++;return {close(){}};};
 try {
  const engine=new VisionEngine();engine.worker={postMessage(){}};engine.isReady=true;
  engine.update({...video(),requestVideoFrameCallback(){throw new Error('not supported for this video');}},1280,720);
  await Promise.resolve();assert.equal(captures,1);assert.equal(engine.diagnostics.frameSource,'polling');
 }finally {globalThis.createImageBitmap=previous;}
});

test('worker runtime failures recover on the main thread without retrying the failed worker path', async()=>{
 const originals={Worker:globalThis.Worker,OffscreenCanvas:globalThis.OffscreenCanvas,createImageBitmap:globalThis.createImageBitmap,window:globalThis.window};
 let worker,created=0,terminated=0;
 globalThis.Worker=class {
  constructor(){worker=this;created++;}
  postMessage(message){if(message.type==='init')queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));}
  terminate(){terminated++;}
 };
 globalThis.OffscreenCanvas=class {};
 globalThis.createImageBitmap=async()=>({close(){}});
 globalThis.window={location:{origin:'http://localhost'}};
 try {
  const engine=new VisionEngine();await engine.init();
  assert.equal(engine.mode,'worker');
  worker.onmessage({data:{type:'error',message:'WebGL/bitmap transfer unsupported'}});
  assert.throws(()=>engine.update(video(),1280,720),/unsupported/);
  engine.pause();await engine.init();
  assert.equal(engine.mode,'main');assert.equal(engine.isReady,true);
  assert.equal(created,1,'automatic recovery must not restart the same incompatible worker');
  assert.equal(terminated,1);assert.deepEqual(engine.update(video(),1280,720),[]);
  engine.pause();
 }finally {for(const [name,value] of Object.entries(originals))globalThis[name]=value;}
});

test('callbacks with frozen media timestamps cannot starve an advancing camera', async()=>{
 const previousPerformance=globalThis.performance,previousBitmap=globalThis.createImageBitmap;
 let now=10000,captures=0,callback;
 Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});
 globalThis.createImageBitmap=async()=>{captures++;return {close(){}};};
 try {
  const engine=new VisionEngine();engine.worker={postMessage(){}};engine.isReady=true;engine.detectionInterval=0;
  const camera={...video(),requestVideoFrameCallback(fn){callback=fn;return 1;},cancelVideoFrameCallback(){}};
  engine.update(camera,1280,720);callback(now,{mediaTime:0});await Promise.resolve();
  assert.equal(captures,1);engine.framePending=false;
  now+=100;camera.currentTime=2;callback(now,{mediaTime:0});
  assert.equal(captures,1);
  now+=101;callback(now,{mediaTime:0});await Promise.resolve();
  assert.equal(captures,2);assert.equal(engine.diagnostics.frameSource,'polling');
 }finally {
  globalThis.createImageBitmap=previousBitmap;
  Object.defineProperty(globalThis,'performance',{value:previousPerformance,configurable:true});
 }
});
