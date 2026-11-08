import { useRef, type PointerEvent, type RefObject } from "react";
import type { Tool } from "../config/tools";
import {site} from '../config/tools';
import { ToolVisual } from "./ToolVisual";

const NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
export const numeral = (n: number) => NUMERALS[n - 1] ?? String(n);
export const FALLBACK_ACCENT = "#0a0a0a";

function displayPath(href: string) {
  if(href.startsWith('/'))return `${site.domain}${href}`;
  return href.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

interface Props {
  tool: Tool;
  index: number;
  active: boolean;
  dimmed: boolean;
  onActive: (active: boolean) => void;
}

export function ToolRow({ tool, index, active, dimmed, onActive }: Props) {
  const ref = useRef<HTMLElement>(null);
  const accent = tool.accent ?? FALLBACK_ACCENT;
  const available = Boolean(tool.href);

  // 光标在条目上的水平位置决定纸盒的朝向
  const onMove = (e: PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--spin", `${((e.clientX - r.left) / r.width - 0.6) * 70}deg`);
  };

  const className = `group relative grid grid-cols-[56px_1fr_480px] gap-x-10 py-12 outline-none transition-opacity duration-500 ${
    dimmed ? "opacity-25" : "opacity-100"
  }`;

  const content = (
    <>
      <span
        aria-hidden
        className="draw absolute inset-x-0 top-0 h-px bg-ink"
        style={{ animationDelay: `${300 + index * 150}ms` }}
      />

      <span
        className="rise pt-3 font-display text-[18px]"
        style={{ animationDelay: `${450 + index * 150}ms` }}
      >
        {numeral(index + 1)}
      </span>

      <div className="rise flex flex-col" style={{ animationDelay: `${520 + index * 150}ms` }}>
        <div className="flex items-baseline gap-4">
          <h2 className="relative font-display text-[72px] leading-none font-semibold tracking-[0.04em]">
            {tool.name}
            <span
              aria-hidden
              className="absolute -bottom-3 left-0 h-[4px] w-full origin-left transition-transform duration-500 ease-[cubic-bezier(.65,0,.25,1)]"
              style={{
                backgroundColor: accent,
                transform: active && available ? "scaleX(1)" : "scaleX(0)",
              }}
            />
          </h2>
          {tool.latin && (
            <span className="text-[13px] tracking-[0.08em] text-muted">{tool.latin}</span>
          )}
        </div>

        <p className={`mt-10 text-[18px] ${tool.tagline ? "" : "text-muted"}`}>
          {tool.tagline ?? "介绍待补充"}
        </p>
        {tool.description && (
          <p className="mt-3 max-w-[28em] text-[14px] leading-7 text-muted">{tool.description}</p>
        )}
        {tool.tags && tool.tags.length > 0 && (
          <p className="mt-5 text-[13px] text-muted">{tool.tags.join(" / ")}</p>
        )}

        <div className="mt-auto flex items-center gap-6 pt-10 text-[14px]">
          {available ? (
            <>
              <span
                className="inline-flex items-center gap-3 px-4 py-2.5 font-medium transition-colors duration-300"
                style={{
                  backgroundColor: active ? accent : "transparent",
                  color: active ? "#fff" : "inherit",
                  boxShadow: `inset 0 0 0 1.5px ${active ? accent : "#0a0a0a"}`,
                }}
              >
                {tool.actionLabel ?? `进入${tool.name}`}
                <svg
                  width="22"
                  height="10"
                  viewBox="0 0 22 10"
                  fill="none"
                  aria-hidden
                  className="transition-transform duration-500 ease-[cubic-bezier(.65,0,.25,1)]"
                  style={{ transform: active ? "translateX(6px)" : "none" }}
                >
                  <path d="M0 5h20M16 1l4 4-4 4" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </span>
              <span className="text-muted tabular-nums">{displayPath(tool.href!)}</span>
            </>
          ) : (
            <span className="px-4 py-2.5 text-muted shadow-[inset_0_0_0_1.5px_#e3e3e3]">
              筹备中
            </span>
          )}
        </div>
      </div>

      <div
        className="rise aspect-[4/3] overflow-hidden"
        style={{ backgroundColor: accent, animationDelay: `${600 + index * 150}ms` }}
      >
        <ToolVisual visual={tool.visual} active={active} />
      </div>
    </>
  );

  const handlers = {
    onPointerEnter: () => onActive(true),
    onPointerLeave: () => onActive(false),
    onPointerMove: onMove,
  };

  if (!tool.href) {
    return (
      <article ref={ref} className={className} {...handlers}>
        {content}
      </article>
    );
  }

  // 整个条目是唯一入口
  return (
    <a
      ref={ref as RefObject<HTMLAnchorElement>}
      href={tool.href}
      className={`${className} focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-brand`}
      onFocus={() => onActive(true)}
      onBlur={() => onActive(false)}
      {...handlers}
    >
      {content}
    </a>
  );
}
