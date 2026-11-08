import { CrackerType } from './catalog';
import { casingThumbnail } from './casingArt';

/** Shared textured material renders are used both in the dock and on the live stage. */
export function crackerArt(type:CrackerType,_color:string):string {
  return `<img src="${casingThumbnail(type)}" alt="" aria-hidden="true" draggable="false" />`;
}
