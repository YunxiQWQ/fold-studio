export function drawCodeError(ctx,w,h,message){
  ctx.save();ctx.strokeStyle='#b45309';ctx.fillStyle='#b45309';ctx.lineWidth=Math.min(w,h)*.025;
  ctx.strokeRect(-w*.46,-h*.46,w*.92,h*.92);ctx.font=`${Math.min(h*.2,w*.1)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(message,0,0,w*.85);ctx.restore();
}
