import {BOX_TYPES} from './geometry.js';
import {RETAIL_STYLES} from './retail-cartons.js';

// Cards describe selectable structures; several cards can share an existing
// project type. Keep retailStyle in dimensions so older .fold files still work.
const retailCards={
  straight:{english:'REVERSE TUCK RETAIL CARTON',description:'圆插舌 · 上下反向插盖 · 四片防尘翼',aliases:['直线盒','反向插盖']},
  same:{english:'SHOULDERED STRAIGHT TUCK CARTON',description:'上下同向插盖 · 收窄锁肩 · 圆插舌',aliases:['同向盖','同向盖盒','锁肩']},
  upper:{english:'ROUND TONGUE TUCK CARTON',description:'上下同向圆舌 · 无收窄锁肩',aliases:['上盖盒','圆舌']},
  airplane:{english:'SAME PANEL TUCK CARTON',description:'顶底盖连接同一盒面 · 管状插扣结构',aliases:['飞机盒','飞机式插扣']},
  lock:{english:'FOUR FLAP LOCK BOTTOM CARTON',description:'圆舌顶盖 · 四片异形插扣底',aliases:['自锁底盒','自锁底','锁底盒','四片扣底']},
  glue:{english:'GLUED BOTTOM RETAIL CARTON',description:'插舌顶盖 · 主底片与短侧底片胶合',aliases:['粘底盒','平粘底']},
  hanging:{english:'HANGER GLUED BOTTOM CARTON',description:'正面挂片 · 长圆挂孔 · 胶合底片',aliases:['挂耳盒','挂耳粘底盒']},
  'hanging-lock':{english:'HANGING LOCK BOTTOM CARTON',description:'背面挂片 · 长圆挂孔 · 四片扣底',aliases:['吊挂盒','吊挂扣底盒']},
};
export const TEMPLATE_CATALOG=Object.fromEntries(Object.entries(BOX_TYPES).flatMap(([type,config])=>
  type==='retail-carton'?Object.entries(RETAIL_STYLES).map(([style,name])=>[
    `${type}-${style}`,{...config,...retailCards[style],name,type,aliases:[...retailCards[style].aliases,'常用彩盒','包装盒型'],defaults:{...config.defaults,retailStyle:style}},
  ]):[[type,{...config,type}]],
));
export function templateId(project){
  return project.type==='retail-carton'?`${project.type}-${project.dimensions.retailStyle??'straight'}`:project.type;
}
export function projectTemplate(project){return TEMPLATE_CATALOG[templateId(project)];}
