import type { ToolVisual as Visual } from "../config/tools";
import { FoldCube } from "./FoldCube";
import {ZhenxiaVisual} from './ZhenxiaVisual';

export function ToolVisual({ visual, active }: { visual: Visual; active: boolean }) {
  if (visual.kind === "image") {
    return (
      <img
        src={/^(?:https?:|data:|blob:)/.test(visual.src)?visual.src:import.meta.env.BASE_URL+visual.src.replace(/^\//,'')}
        alt={visual.alt}
        className={`h-full w-full object-cover transition-transform duration-1000 ease-out ${active ? "scale-[1.03]" : ""}`}
      />
    );
  }
  if (visual.kind === "illustration" && visual.name === "fold") {
    return <FoldCube folded={active} />;
  }
  if(visual.kind==='illustration'&&visual.name==='zhenxia')return <ZhenxiaVisual active={active}/>;
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div
        className={`flex h-full w-full items-center justify-center border transition-colors duration-500 ${
          active ? "border-white/60" : "border-white/20"
        }`}
      >
        <span className="font-display text-[13px] tracking-[0.4em] text-white/60">图待补</span>
      </div>
    </div>
  );
}
