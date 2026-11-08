import type { CrackerType } from './catalog';

type RGB = readonly [number,number,number];
interface Casing { canvas: HTMLCanvasElement; anchor: {x:number;y:number}; height:number; }
const casings = new Map<CrackerType,Casing>();
const thumbnails = new Map<CrackerType,string>();
const SIZE=256;

function noise(x:number,y:number,seed:number):number {
  let n=Math.imul(x+seed*127,374761393)^Math.imul(y+seed*43,668265263);
  n=Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)/4294967295-.5;
}
function canvas():HTMLCanvasElement {const c=document.createElement('canvas');c.width=c.height=SIZE;return c;}
function surface(ctx:CanvasRenderingContext2D, sample:(x:number,y:number)=>[number,number,number,number]|null):void {
  const layer=canvas(), paint=layer.getContext('2d')!, image=paint.createImageData(SIZE,SIZE);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++) {
    const color=sample(x+.5,y+.5);if(!color)continue;
    const i=(y*SIZE+x)*4;
    image.data[i]=color[0];image.data[i+1]=color[1];image.data[i+2]=color[2];image.data[i+3]=color[3];
  }
  paint.putImageData(image,0,0);ctx.drawImage(layer,0,0);
}
function shadow(ctx:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number):void {
  ctx.save();ctx.translate(x,y);ctx.scale(1,ry/rx);
  const g=ctx.createRadialGradient(0,0,0,0,0,rx);g.addColorStop(0,'#0009');g.addColorStop(1,'#0000');
  ctx.fillStyle=g;ctx.fillRect(-rx,-rx,rx*2,rx*2);ctx.restore();
}
function ellipse(ctx:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,fill:string|CanvasGradient):void {
  ctx.fillStyle=fill;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();
}
function tube(ctx:CanvasRenderingContext2D,top:number,bottom:number,radius:number,paper:RGB,seed:number,label=true):void {
  shadow(ctx,128,bottom+12,radius+12,8);
  surface(ctx,(x,y)=>{
    const u=(x-128)/radius;if(Math.abs(u)>=1)return null;
    const z=Math.sqrt(1-u*u), edge=bottom+7*z;
    if(y<top||y>edge)return null;
    const v=(y-top)/(bottom-top), worn=noise(x,y,seed)*14+noise(x>>2,y>>2,seed+2)*6;
    const light=.32+.64*(z*.87-u*.28);
    const crease=Math.sin(x*.37+Math.sin(y*.12))*.8;
    const band=label&&v>.43&&v<.7;
    const rgb:RGB=band?[163,146,115]:paper;
    const seam=x>128+radius*.66&&x<128+radius*.73?-14:0;
    return [rgb[0]*light+worn+crease+seam,rgb[1]*light+worn+crease+seam,rgb[2]*light+worn+crease+seam,255];
  });
  const lip=ctx.createLinearGradient(128-radius,0,128+radius,0);
  lip.addColorStop(0,'#473b2b');lip.addColorStop(.35,'#b39a71');lip.addColorStop(1,'#50402d');
  ellipse(ctx,128,top,radius,8,lip);
  ellipse(ctx,128,top-1,radius-3,5,'#312a22');
  ellipse(ctx,127,top-1,4,2,'#151410');
  ctx.strokeStyle='#d5bb8b55';ctx.lineWidth=.7;
  // Fine paper fibers, with seams and small scuffs rather than decorative stripes.
  for(let i=0;i<125;i++) {
    const x=128+(noise(i,3,seed)*2)*(radius-2), y=top+4+(noise(i,7,seed)+.5)*(bottom-top-8);
    ctx.globalAlpha=.12+Math.abs(noise(i,9,seed))*.35;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+noise(i,12,seed)*3,y+1+Math.abs(noise(i,1,seed))*4);ctx.stroke();
  }
  ctx.globalAlpha=1;
}
function ink(ctx:CanvasRenderingContext2D,text:string,y:number,size=9):void {
  ctx.save();ctx.translate(128,y);ctx.scale(.92,1);ctx.fillStyle='#322a22aa';ctx.textAlign='center';ctx.font=`600 ${size}px Georgia,serif`;ctx.fillText(text,0,0);ctx.restore();
}
function ball(ctx:CanvasRenderingContext2D,radius:number,color:RGB,seed:number,jute:boolean):void {
  const cx=128,cy=157;
  shadow(ctx,cx,cy+radius+7,radius+9,9);
  surface(ctx,(x,y)=>{
    const u=(x-cx)/radius,v=(y-cy)/(radius*.95),angle=Math.atan2(v,u);
    const rough=1+Math.sin(angle*7)*.012+Math.cos(angle*11)*.009;
    const norm=(u*u+v*v)/(rough*rough);if(norm>=1)return null;
    const z=Math.sqrt(1-norm), light=.28+.7*Math.max(0,-u*.35-v*.45+z*.78);
    const grain=noise(x,y,seed)*15+noise(x>>2,y>>2,seed+1)*5;
    return [color[0]*light+grain,color[1]*light+grain,color[2]*light+grain,255];
  });
  if(!jute) {
    ctx.strokeStyle='#79634c66';ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(cx,cy,radius*.98,radius*.33,-.24,0,Math.PI*2);ctx.stroke();
    return;
  }
  // Three real winding directions projected onto a sphere; only front-facing cord is visible.
  for(let group=0;group<3;group++) {
    const azimuth=group*1.14+.24, tilt=.45+group*.17;
    const n=[Math.cos(azimuth)*Math.cos(tilt),Math.sin(azimuth)*Math.cos(tilt),Math.sin(tilt)];
    const u=[-Math.sin(azimuth),Math.cos(azimuth),0];
    const v=[-Math.cos(azimuth)*Math.sin(tilt),-Math.sin(azimuth)*Math.sin(tilt),Math.cos(tilt)];
    for(let row=0;row<10;row++) {
      const offset=-.82+row*.18, ring=Math.sqrt(1-offset*offset);
      const points:Array<[number,number]|null>=[];
      for(let i=0;i<=160;i++) {
        const a=i/160*Math.PI*2, c=Math.cos(a)*ring,s=Math.sin(a)*ring;
        const px=n[0]*offset+u[0]*c+v[0]*s,py=n[1]*offset+u[1]*c+v[1]*s,pz=n[2]*offset+u[2]*c+v[2]*s;
        points.push(pz>0?[cx+px*radius,cy+py*radius*.95]:null);
      }
      const line=(dx:number,dy:number)=>{
        ctx.beginPath();let moving=true;
        for(const p of points){if(!p){moving=true;continue;}if(moving){ctx.moveTo(p[0]+dx,p[1]+dy);moving=false;}else ctx.lineTo(p[0]+dx,p[1]+dy);}
        ctx.stroke();
      };
      ctx.lineCap='round';ctx.lineWidth=3.6;ctx.strokeStyle='#241d1499';line(.5,1);
      const fiber=ctx.createLinearGradient(cx-radius,cy-radius,cx+radius,cy+radius);
      fiber.addColorStop(0,'#c8ae80');fiber.addColorStop(.48,'#9c8055');fiber.addColorStop(1,'#5f4c31');
      ctx.lineWidth=2.7;ctx.strokeStyle=fiber;line(0,0);
      ctx.lineWidth=.55;ctx.strokeStyle='#ead6aa66';line(-.45,-.6);
    }
  }
  // Frayed jute ends catch light without making the cord glossy.
  ctx.lineWidth=.55;ctx.strokeStyle='#d7c49b88';
  for(let i=0;i<75;i++) {
    const a=i*2.4, r=Math.sqrt((i+.5)/75)*radius*.95,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*.95;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+noise(i,3,seed)*5,y-1-Math.abs(noise(i,5,seed))*4);ctx.stroke();
  }
}
function fuse(ctx:CanvasRenderingContext2D,x:number,y:number,length:number):void {
  ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x-5,y-length*.3,x+14,y-length*.65,x+8,y-length);
  ctx.strokeStyle='#382f20';ctx.lineWidth=3.5;ctx.stroke();ctx.strokeStyle='#a19472';ctx.lineWidth=2;ctx.stroke();
  ctx.strokeStyle='#d2c39b';ctx.lineWidth=.5;ctx.stroke();
}

export function casing(type:CrackerType):Casing {
  const cached=casings.get(type);if(cached)return cached;
  const image=canvas(),ctx=image.getContext('2d')!;
  let anchor={x:128,y:64},height=144;
  switch(type) {
    case 'GANGA_JAMUNA': tube(ctx,64,208,35,[139,68,51],3);ink(ctx,'GANGA',139);ink(ctx,'JAMUNA',151);break;
    case 'BULLET_BOMB':tube(ctx,74,208,22,[132,52,42],9);ink(ctx,'BULLET',148,7);anchor={x:128,y:74};height=134;break;
    case 'ROMAN_CANDLE':tube(ctx,51,212,18,[52,65,71],7);ink(ctx,'5',147,14);anchor={x:128,y:51};height=161;break;
    case 'SUTLI_BOMB':ball(ctx,49,[72,78,48],6,true);anchor={x:128,y:105};height=98;break;
    case 'STARBURST':ball(ctx,46,[148,117,79],12,false);anchor={x:128,y:111};height=92;break;
    case 'ANAR': {
      shadow(ctx,128,222,49,8);
      surface(ctx,(x,y)=>{const v=(y-80)/132;if(v<0||v>1)return null;const r=5+v*42,u=(x-128)/r;if(Math.abs(u)>1)return null;
        const light=.35+.62*(Math.sqrt(1-u*u)*.85-u*.3),grain=noise(x,y,3)*17;
        const rgb:RGB=v>.53&&v<.72?[163,144,110]:[139,87,53];
        return [rgb[0]*light+grain,rgb[1]*light+grain,rgb[2]*light+grain,255];});
      ellipse(ctx,128,80,5,2,'#242018');ink(ctx,'ANAR',168,8);anchor={x:128,y:80};height=132;break;
    }
    case 'ROCKET': {
      tube(ctx,91,182,18,[130,53,44],4);
      ctx.fillStyle='#9c5343';ctx.beginPath();ctx.moveTo(103,93);ctx.lineTo(128,49);ctx.lineTo(153,93);ctx.closePath();ctx.fill();
      ctx.fillStyle='#66372e';ctx.beginPath();ctx.moveTo(128,49);ctx.lineTo(153,93);ctx.lineTo(128,91);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#a18c67';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(128,183);ctx.lineTo(128,248);ctx.stroke();
      ink(ctx,'ROCKET',144,6);anchor={x:128,y:49};height=199;break;
    }
    case 'CHAKRI': {
      shadow(ctx,128,207,78,11);ellipse(ctx,128,185,69,27,'#6f5736');
      const top=ctx.createRadialGradient(104,146,5,128,163,79);top.addColorStop(0,'#cbb28c');top.addColorStop(1,'#79613f');
      ellipse(ctx,128,171,70,30,top);
      ctx.save();ctx.translate(128,171);ctx.scale(1,.42);ctx.beginPath();
      for(let i=0;i<=750;i++){const a=i/750*Math.PI*13,r=3+i/750*63;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
      ctx.lineWidth=3;ctx.strokeStyle='#4f402a';ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle='#e0c49a77';ctx.stroke();ctx.restore();
      anchor={x:128,y:171};height=60;break;
    }
    case 'PHOOLJHADI': {
      ctx.lineCap='round';ctx.strokeStyle='#7c7c74';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(99,233);ctx.lineTo(153,60);ctx.stroke();
      ctx.lineWidth=7;ctx.strokeStyle='#6a675d';ctx.beginPath();ctx.moveTo(124,151);ctx.lineTo(153,60);ctx.stroke();
      ctx.lineWidth=.7;for(let i=0;i<150;i++){const t=i/150,x=124+t*29,y=151-t*91;ctx.strokeStyle=i%3?'#a8a28a66':'#282a27';ctx.beginPath();ctx.moveTo(x+noise(i,1,3)*6,y);ctx.lineTo(x+noise(i,3,2)*7,y-2);ctx.stroke();}
      anchor={x:153,y:60};height=173;break;
    }
    case 'GRAND_FINALE': {
      shadow(ctx,128,215,89,9);ctx.fillStyle='#51402b';ctx.fillRect(53,123,150,80);ctx.fillStyle='#8b6f48';ctx.fillRect(53,130,143,71);
      ctx.fillStyle='#a68b63';ctx.beginPath();ctx.moveTo(53,123);ctx.lineTo(77,89);ctx.lineTo(220,89);ctx.lineTo(203,123);ctx.closePath();ctx.fill();
      for(let row=0;row<3;row++)for(let col=0;col<5;col++){ellipse(ctx,81+col*26-row*5,96+row*9,9,4,'#352e24');ellipse(ctx,81+col*26-row*5,96+row*9,6,2.7,'#171814');}
      ctx.fillStyle='#bca780';ctx.fillRect(67,150,114,28);ink(ctx,'BARRAGE',168,10);anchor={x:128,y:96};height=109;break;
    }
  }
  const value={canvas:image,anchor,height};casings.set(type,value);return value;
}

export function casingThumbnail(type:CrackerType):string {
  const cached=thumbnails.get(type);if(cached)return cached;
  const item=casing(type),thumb=canvas(),ctx=thumb.getContext('2d')!;
  ctx.drawImage(item.canvas,0,0);
  if(!['CHAKRI','PHOOLJHADI','GRAND_FINALE','ROCKET'].includes(type))fuse(ctx,item.anchor.x,item.anchor.y,30);
  // Trim empty space so a small bomb is as legible as the taller tubes in the dock.
  const pixels=ctx.getImageData(0,0,SIZE,SIZE).data;
  let left=SIZE,top=SIZE,right=0,bottom=0;
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(pixels[(y*SIZE+x)*4+3]>8){
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  const edge=Math.max(right-left,bottom-top)+16,cx=(left+right)/2,cy=(top+bottom)/2;
  const fitted=canvas();fitted.getContext('2d')!.drawImage(thumb,cx-edge/2,cy-edge/2,edge,edge,0,0,SIZE,SIZE);
  const url=fitted.toDataURL('image/png');thumbnails.set(type,url);return url;
}

export function drawCasing(ctx:CanvasRenderingContext2D,type:CrackerType,x:number,y:number,height:number):void {
  const item=casing(type),scale=height/item.height;
  ctx.drawImage(item.canvas,x-item.anchor.x*scale,y-item.anchor.y*scale,SIZE*scale,SIZE*scale);
}

export function fuseTip(x:number,y:number,progress:number):{x:number;y:number} {
  const remaining=Math.max(0,1-progress);
  return {x:x+Math.sin(remaining*1.8)*6,y:y-24*remaining};
}
export function drawBurningFuse(ctx:CanvasRenderingContext2D,x:number,y:number,progress:number):void {
  const tip=fuseTip(x,y,progress);
  ctx.save();ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x-2,(y+tip.y)/2,tip.x,tip.y);
  ctx.strokeStyle='#393023';ctx.lineWidth=1.8;ctx.stroke();ctx.strokeStyle='#b3a17b';ctx.lineWidth=.8;ctx.stroke();ctx.restore();
}
