import {sideOf} from './project.js';
import {validateSvgAsset} from './svg-asset.js';

// The SVG document is the artwork source; these temporary layers only bridge
// the existing print/texture renderer. They are never shown as UI layers.
export function svgSceneLayers(project,dieline){
  const panel=dieline.panels[0];
  return Object.entries(project.svgArtwork??{}).map(([side,svg])=>{
    validateSvgAsset(svg);
    const [x,y,w,h]=svg.viewBox,cx=x+w/2,cy=y+h/2;
    return {id:'native-scene-'+side,type:'svg',svg,svgOriginal:true,proofNative:true,side,panel:panel.id,
      x:side==='inside'?1-(cx-panel.x)/panel.w:(cx-panel.x)/panel.w,y:(cy-panel.y)/panel.h,
      w:w/panel.w,h:h/panel.h,rotation:0,opacity:1,visible:true,color:'#39563c'};
  });
}

export function sceneLayersForSide(project,dieline,side){return svgSceneLayers(project,dieline).filter(l=>sideOf(l)===side);}
