import type { CSSProperties, ReactNode } from "react";

const S = 58;
const EASE = "cubic-bezier(.65,0,.25,1)";

type Side = "top" | "right" | "bottom" | "left";

/**
 * 折间的预览：一张纯 CSS 3D 刀版。
 * 平铺时为盒子展开图（虚线为折痕），folded=true 时依次折叠成型并转为等轴测视角。
 */
export function FoldCube({ folded }: { folded: boolean }) {
  // 折叠：侧面 → 背面 → 盖子 → 插舌；展开时顺序相反
  const delay = (fold: number, unfold: number) => `${folded ? fold : unfold}ms`;
  const move = (fold: number, unfold: number): CSSProperties => ({
    transition: `transform 800ms ${EASE} ${delay(fold, unfold)}`,
  });

  const face = (tint: number, dashed: Side[], extra?: CSSProperties): CSSProperties => {
    const solid = "#0a0a0a";
    const style: CSSProperties = {
      position: "absolute",
      width: S,
      height: S,
      background: `color-mix(in srgb, #0a0a0a ${Math.round(tint / 2.2)}%, #ffffff)`,
      borderWidth: 1.25,
      borderStyle: "solid",
      borderColor: solid,
      transformStyle: "preserve-3d",
      ...extra,
    };
    for (const side of dashed) {
      const key = side[0].toUpperCase() + side.slice(1);
      (style as Record<string, unknown>)[`border${key}Style`] = "dashed";
      (style as Record<string, unknown>)[`border${key}Color`] = "#0a0a0a";
    }
    return style;
  };

  return (
    <div
      data-folded={folded}
      className="group/fold flex h-full w-full items-center justify-center [perspective:1400px]"
    >
      <div
        style={{
          transformStyle: "preserve-3d",
          transition: `transform 1100ms ${EASE} ${folded ? "0ms" : "500ms"}`,
          transform: folded
            ? `translateY(${S * 0.35}px) rotateX(58deg) scale(2.05)`
            : `translateY(${S * 0.66}px) rotateX(0deg) scale(1)`,
        }}
      >
        {/* 折叠后随光标转动（--spin 由外层条目设置） */}
        <div
          style={{
            transformStyle: "preserve-3d",
            transition: `transform 900ms cubic-bezier(.2,.7,.2,1)`,
            transform: folded ? "rotateZ(calc(-38deg + var(--spin, 0deg)))" : "rotateZ(0deg)",
          }}
        >
          {/* 底面 */}
          <div style={face(22, ["top", "right", "bottom", "left"], { position: "relative" })}>
            <Label>底</Label>

            {/* 正面 */}
            <div
              style={{
                ...face(34, ["top"]),
                left: -1.25,
                top: "100%",
                transformOrigin: "top",
                transform: folded ? "rotateX(90deg)" : "none",
                ...move(0, 500),
              }}
            >
              <Label>前</Label>
            </div>

            {/* 左侧 */}
            <div
              style={{
                ...face(26, ["right"]),
                right: "100%",
                top: -1.25,
                transformOrigin: "right",
                transform: folded ? "rotateY(90deg)" : "none",
                ...move(60, 440),
              }}
            />

            {/* 右侧 */}
            <div
              style={{
                ...face(52, ["left"]),
                left: "100%",
                top: -1.25,
                transformOrigin: "left",
                transform: folded ? "rotateY(-90deg)" : "none",
                ...move(60, 440),
              }}
            />

            {/* 背面 + 盖子 + 插舌 */}
            <div
              style={{
                ...face(18, ["bottom", "top"]),
                left: -1.25,
                bottom: "100%",
                transformOrigin: "bottom",
                transform: folded ? "rotateX(-90deg)" : "none",
                ...move(140, 360),
              }}
            >
              <Label>后</Label>
              <div
                style={{
                  ...face(40, ["bottom", "top"]),
                  left: -1.25,
                  bottom: "100%",
                  transformOrigin: "bottom",
                  transform: folded ? "rotateX(-90deg)" : "none",
                  ...move(520, 160),
                }}
              >
                <Label>盖</Label>
                <div
                  style={{
                    ...face(46, ["bottom"], { height: S * 0.32, borderRadius: "10px 10px 0 0" }),
                    left: -1.25,
                    bottom: "100%",
                    transformOrigin: "bottom",
                    transform: folded ? "rotateX(-90deg)" : "none",
                    ...move(760, 0),
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="absolute inset-0 flex items-center justify-center font-display text-[11px] text-ink/40 transition-opacity duration-300 select-none group-data-[folded=true]/fold:opacity-0">
      {children}
    </span>
  );
}
