/**
 * 雲溪工具箱 · 工具配置
 *
 * 新增工具：在 `tools` 数组中追加一条配置即可，页面会自动渲染卡片。
 * - `href` 为 null 时，卡片显示“筹备中”，不会出现可点击入口。
 * - `tagline` 为 null 时，显示“介绍待补充”。
 * - `visual` 决定卡片预览区：内置插画 / 自定义图片（放在 public/ 下）/ 占位。
 */

export type ToolVisual =
  /** 使用内置 SVG 插画，见 src/components/ToolVisual.tsx */
  | { kind: "illustration"; name: "fold" | "zhenxia" }
  /** 使用图片，例如 '/previews/zhenxia.png'（放在 public/previews/ 下） */
  | { kind: "image"; src: string; alt: string }
  /** 尚无预览图 */
  | { kind: "placeholder" };

export interface Tool {
  /** 唯一标识，仅用于渲染 key */
  id: string;
  /** 工具名称 */
  name: string;
  /** 拼音或英文名，作为副标题 */
  latin?: string;
  /** 一句话定位 */
  tagline: string | null;
  /** 简短介绍（一两句话） */
  description: string | null;
  /** 访问地址；未确定时保持 null */
  href: string | null;
  /** 下载型工具可自定义入口文案；默认“进入工具名” */
  actionLabel?: string;
  /** 标签，最多建议 3 个 */
  tags?: string[];
  /** 工具主色：预览区底色，悬停时顶部色带也会切换为此色 */
  accent?: string;
  visual: ToolVisual;
}

export const tools: Tool[] = [
  {
    id: "fold",
    name: "折间",
    latin: "Fold",
    tagline: "包装刀版与三维折叠设计工具",
    description: "选择包装结构，在可编辑刀版上排版，并在三维视图中检查折叠成型的效果。",
    href: "/fold",
    tags: ["包装设计", "刀版", "3D 预览"],
    accent: "#ff4416", // 朱红
    visual: { kind: "illustration", name: "fold" },
  },
  {
    id: "huaxin",
    name: "画芯",
    latin: "Huaxin",
    tagline: "中文报刊与电子画册排版工具",
    description: "从多页模板开始编排文字与图片，支持中文分栏、本机自动备份与本机字体，导出 PDF、页面图片或可编辑工程。无需账号，内容留在本机。",
    href: "/huaxin/",
    tags: ["报刊排版", "电子画册", "本机备份"],
    accent: "#b92424",
    visual: { kind: "image", src: "previews/huaxin.svg", alt: "画芯的报纸分栏与多页画册示意" },
  },
  {
    id: "zhenxia",
    name: "帧匣",
    latin: "Zhenxia",
    tagline: "Windows 截图、贴图与剪贴板工具",
    description: "收好文字与图片的剪贴板历史，截取、标注画面，让参考图常驻桌面。提供 Windows 安装版与便携版。",
    href: "https://github.com/YunxiQWQ/zhenxia/releases/latest",
    actionLabel: "下载 Windows 版",
    tags: ["截图标注", "桌面贴图", "剪贴板"],
    accent: "#0a0a0a",
    visual: { kind: "illustration", name: "zhenxia" },
  },
];

export const site = {
  name: "雲溪工具箱",
  domain: "tool.heyunxi.top",
  intro: "为设计工作而做的小工具",
  description: "雲溪工具箱：折间包装刀版与三维设计、画芯中文报刊与电子画册排版、帧匣 Windows 截图贴图与剪贴板工具。",
  indexable: true,
};
