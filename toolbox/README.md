# 雲溪工具箱

用户提供的 Opus / Figma Make 导航页，保留大字标题、工具条目、悬停换色与 CSS 折叠预览。接入时补齐了帧匣的公开介绍、下载入口与功能示意图。

## 日常维护

修改 `src/config/tools.ts` 即可更新工具、顺序、入口、文案和站点信息。新增条目示例：

```ts
{
  id: 'example',
  name: '示例工具',
  latin: 'Example',
  tagline: '一句话介绍',
  description: '简短说明用途。',
  href: '/example',
  tags: ['设计'],
  accent: '#39563c',
  visual: { kind: 'image', src: 'previews/example.png', alt: '示例预览' },
}
```

预览图放在 `public/previews/`，相对图片路径由构建基础路径解析。`actionLabel` 可自定义按钮，如“下载 Windows 版”。`href: null` 表示筹备中的工具；新增 `/example` 类型的本地入口时，需要同时提供相应工具页面和托管路由。

- 折间：同站 `/fold`，保持本地与线上地址一致。
- 帧匣：`https://github.com/YunxiQWQ/zhenxia/releases/latest`，已核实仓库公开发行版；页面显示 Windows 下载入口。
- 仅使用系统字体，无账号、统计脚本、Cookie 或本地存储。
- `site.indexable` 为 `true`，让工具导航成为可抓取的折间入口；不涉及个人主页和博客。站点地图只列出折间和使用指南。

## 开发与构建

在本目录执行 `npm ci --ignore-scripts` 和 `npm run dev`，开发地址使用 `/toolbox/` 基础路径。`npm run build` 包含 TypeScript 检查和导航预渲染，输出到仓库的 `dist/toolbox/`；浏览器激活交互时保留同一份页面内容。

整站构建及路由说明见 [docs/toolbox-home.md](../docs/toolbox-home.md)。导航页的 React / React DOM / Scheduler 与 Tailwind CSS 许可证见 [THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt)。
