import type { NormalizedLandmark, FingerName, FingerState } from './gestureTypes';

type Point = NormalizedLandmark;
const distance = (a: Point, b: Point) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
function angle(a: Point, b: Point, c: Point): number {
  const ax=a.x-b.x, ay=a.y-b.y, az=a.z-b.z;
  const cx=c.x-b.x, cy=c.y-b.y, cz=c.z-b.z;
  const length=Math.hypot(ax,ay,az)*Math.hypot(cx,cy,cz);
  if(length<1e-9)return 0;
  return Math.acos(Math.max(-1,Math.min(1,(ax*cx+ay*cy+az*cz)/length)))*180/Math.PI;
}

/** Joint geometry uses model world coordinates, independent of screen size and hand distance. */
export function fingerGeometry(points: Point[]): Record<FingerName,FingerState> {
  const states = {} as Record<FingerName,FingerState>;
  for (const [name,mcp] of [['index',5],['middle',9],['ring',13],['pinky',17]] as const) {
    const base=points[mcp], pip=points[mcp+1], dip=points[mcp+2], tip=points[mcp+3];
    const proximal=distance(base,pip);
    if(proximal<1e-6){states[name]='uncertain';continue;}
    const bend=angle(base,pip,dip), end=angle(pip,dip,tip);
    if(bend>150 && end>140 && distance(base,tip)>proximal*1.7)states[name]='extended';
    else if(bend<130 || distance(base,tip)<proximal*1.45)states[name]='folded';
    else states[name]='uncertain';
  }
  const tip=points[4], ip=points[3], mcp=points[2], pinky=points[17];
  const bend=angle(mcp,ip,tip);
  if(bend>150 && distance(tip,pinky)>distance(ip,pinky)*1.08)states.thumb='extended';
  else if(bend<130 || distance(tip,pinky)<distance(ip,pinky)*1.02)states.thumb='folded';
  else states.thumb='uncertain';
  return states;
}

export function pinchRatio(points: Point[]): number {
  const palm = Math.max(distance(points[0],points[9]), distance(points[5],points[17]));
  return palm>1e-6 ? distance(points[4],points[8])/palm : Infinity;
}

/** Image-space contact is more reliable than estimated depth when fingertips occlude. */
export function pinchContact(points: Point[], wasPinching = false): boolean {
  const distance2D = (a: Point, b: Point) => Math.hypot(a.x-b.x, a.y-b.y);
  const palm = Math.max(distance2D(points[0],points[9]), distance2D(points[5],points[17]));
  if (palm < 1e-6) return false;
  const ratio = distance2D(points[4],points[8]) / palm;
  return ratio < (wasPinching ? 0.4 : 0.28);
}
