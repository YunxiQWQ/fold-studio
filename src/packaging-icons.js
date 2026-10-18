import {mdiRecycle,mdiGlassFragile,mdiUmbrella,mdiWeatherSunnyOff,mdiThermometer,mdiSnowflake,mdiSnowflakeOff,mdiWaterOff,mdiHookOff,mdiForklift,mdiHandBackRightOff,mdiHandHeart,mdiFire,mdiFireOff,mdiSmokingOff,mdiWeightKilogram,mdiPackageVariantClosed,mdiLeaf,mdiSprout,mdiFoodApple,mdiCupWater,mdiHandWash,mdiTrashCanOutline,mdiBottleWine,mdiArrowUpBoldBoxOutline,mdiWaterCheck} from '@mdi/js';

// Pictogrammers Material Design Icons 7.4.47; Apache-2.0. Named imports bundle only these paths.
export const OPEN_SYMBOLS=[
  ['recycle','通用回收','回收与材质',mdiRecycle],['fragile','易碎品 · 小心轻放','运输与储存',mdiGlassFragile],
  ['keep-dry','保持干燥','运输与储存',mdiUmbrella],['sun-protect','避免阳光直射','运输与储存',mdiWeatherSunnyOff],
  ['temperature','温度控制','运输与储存',mdiThermometer],['keep-frozen','冷冻储存','运输与储存',mdiSnowflake],
  ['no-freezing','避免冷冻','运输与储存',mdiSnowflakeOff],['no-water','避免沾水','运输与储存',mdiWaterOff],
  ['no-hooks','禁止吊钩','运输与储存',mdiHookOff],['forklift','叉车搬运','运输与储存',mdiForklift],
  ['no-touch','请勿触碰','运输与储存',mdiHandBackRightOff],['handle-care','轻拿轻放','运输与储存',mdiHandHeart],
  ['flammable','易燃图示','运输与储存',mdiFire],['keep-away-fire','远离火源','运输与储存',mdiFireOff],
  ['no-smoking','禁止吸烟','运输与储存',mdiSmokingOff],['weight','重量标示','运输与储存',mdiWeightKilogram],
  ['package','包装箱','运输与储存',mdiPackageVariantClosed],['up-arrow','朝上放置','运输与储存',mdiArrowUpBoldBoxOutline],
  ['eco-leaf','绿叶图案','回收与材质',mdiLeaf],['eco-sprout','幼苗图案','回收与材质',mdiSprout],
  ['sort-waste','分类投放','回收与材质',mdiTrashCanOutline],['food-apple','水果图案','食品与日用',mdiFoodApple],
  ['drinking-water','饮用水图案','食品与日用',mdiCupWater],['wash-hands','洗手图案','食品与日用',mdiHandWash],
  ['glass-bottle','玻璃瓶图案','食品与日用',mdiBottleWine],['water-check','水滴图案','食品与日用',mdiWaterCheck],
].map(([id,name,category,path])=>({id,name,category,path,source:'Pictogrammers MDI',license:'Apache-2.0'}));

export function drawOpenSymbol(ctx,path,w,h){
  const size=Math.min(w,h)*.9;ctx.save();ctx.translate(-size/2,-size/2);ctx.scale(size/24,size/24);ctx.fill(new Path2D(path));ctx.restore();
}
export function openSymbolSvg(symbol){return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${symbol.path}"/></svg>`;}
