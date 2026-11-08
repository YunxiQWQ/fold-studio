import { useState } from "react";
import { FALLBACK_ACCENT, numeral, ToolRow } from "./components/ToolRow";
import { site, tools } from "./config/tools";

const BRAND = "#1e2bff";

export default function App({year=new Date().getFullYear()}:{year?:number}={}) {
  const [active, setActive] = useState<number | null>(null);
  const liveCount = tools.filter((t) => t.href).length;
  // 顶部色带跟随当前悬停的工具换色
  const band = active === null ? BRAND : (tools[active].accent ?? FALLBACK_ACCENT);

  return (
    <div className="flex min-h-screen min-w-[1180px] flex-col bg-paper text-ink">
      <header
        className="text-white transition-colors duration-700 ease-[cubic-bezier(.65,0,.25,1)]"
        style={{ backgroundColor: band }}
      >
        <div className="mx-auto max-w-[1280px] px-16">
          <div className="rise flex items-center justify-between pt-8 text-[13px]">
            <span>{site.domain}</span>
            <span>
              收录{numeral(tools.length)}种 · 已开放{numeral(liveCount)}种
            </span>
          </div>
          <div className="flex items-end justify-between pt-28 pb-12">
            <h1
              className="rise font-display text-[132px] leading-[0.9] font-semibold tracking-[0.04em]"
              style={{ animationDelay: "100ms" }}
            >
              {site.name}
            </h1>
            <p
              className="rise pb-3 text-[16px] tracking-[0.2em]"
              style={{ animationDelay: "200ms" }}
            >
              {site.intro}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-16 pt-14">
        <div
          className="rise flex items-baseline justify-between pb-8"
          style={{ animationDelay: "250ms" }}
        >
          <span className="font-display text-[15px] tracking-[0.3em]">目录</span>
          <span className="text-[13px] text-muted">{year}</span>
        </div>

        {/* 工具较少时直接平铺；数量增多后再按需加入分类与搜索 */}
        <section aria-label="工具列表">
          {tools.map((tool, i) => (
            <ToolRow
              key={tool.id}
              tool={tool}
              index={i}
              active={active === i}
              dimmed={active !== null && active !== i}
              onActive={(on) => setActive((cur) => (on ? i : cur === i ? null : cur))}
            />
          ))}
          <div
            className="draw h-px bg-ink"
            style={{ animationDelay: `${300 + tools.length * 150}ms` }}
          />
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-[1280px] justify-between px-16 py-12 text-[12px] text-muted">
        <span>更多工具陆续收录。 <a href="/fold/guide" className="ml-4 underline underline-offset-4">折间功能与使用指南</a></span>
        <span>不使用 Cookie，不收集个人信息</span>
      </footer>
    </div>
  );
}
