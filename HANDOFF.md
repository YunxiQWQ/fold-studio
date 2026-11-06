# 折间 Fold Studio · 界面重构交接说明

分支：`figma/ui-redesign`（请保留，不要删除或改写历史）
远端：`https://github.com/YunxiQWQ/fold-studio.git`

## 1. 基线

| 项目 | 值 |
|---|---|
| 基线提交 | `cb71ef398a77a0959f41f2e25ffb13056a3ac52d`（`cb71ef3`，`[codex] feat: add slotted handle carton and repair SVG ungrouping`） |
| 基线位置 | GitHub `main` 当前指向此提交 |

## 2. 重构提交（按时间顺序）

| 完整 ID | 说明 |
|---|---|
| `c4f7b33ed9dd191c09f7db8602f9ba303b01ee7a` | Configure Figma Make lifecycle（Figma Make 安装、开发、部署脚本） |
| `86f8b5a87d07f2b215d8b276c0d26747dfa16379` | Redesign workspace shell, dialogs and libraries（整体界面重构） |

本文件 `HANDOFF.md` 在上述两个提交之后单独提交（第三个提交，仅新增本文件，不含代码改动）。

推送状态：**尚未推送到 GitHub。** 本环境的 GitHub 令牌失效（`Invalid username or token`），远端目前只有 `main`。需在 Figma Make 中重新授权 GitHub 后推送 `figma/ui-redesign`，或使用下方 Git bundle 导入。

## 3. 修改文件（`cb71ef3..86f8b5a`，16 个文件，+788 / −798）

### 已删除（3 个）

- `src/style.css` — 旧全局样式，由 `src/app.css` 取代（删除前已确认无任何导入引用）
- `src/compact-workspace.js` — 旧紧凑工作区脚本，由 `src/workspace-shell.js` 与新布局取代
- `src/compact-workspace.css` — 旧紧凑工作区样式，由 `src/app.css` 取代

### 新增

- `src/app.css` — 新的主题变量（light / warm / gray / slate / dark）、布局、工具栏、面板、对话框和响应式样式
- `src/workspace-shell.js` — 平板宽度（860–1180px）下左右侧栏抽屉：遮罩、Esc 关闭、焦点返回、`inert`、`aria-expanded`
- `.figma/make/deploy`、`.figma/make/deploy-preview`、`.figma/make/dev`、`.figma/make/install`、`.figma/make/mise.toml` — Figma Make 运行与部署脚本（提交 `c4f7b33`）

### 修改

- `src/main.js` — 重写应用外壳标记；改为导入 `app.css`；接入 `initWorkspaceShell`；帮助、GLB 导出、结构库对话框重做；结构库搜索与分类筛选；`#open-templates` 移入顶栏；当前结构卡片可点击打开结构库
- `src/editor-ui.js` — 编辑菜单按钮改为替换 `#edit-menu-anchor`
- `src/icons.js` — 新增 `keyboard`、`panel-left`、`panel-right`、`folder`、`search` 图标
- `src/project-library-ui.js` — 工程库入口按钮放入顶栏文件操作组；关闭按钮改用图标
- `src/workspace-resizer.js` — 折叠分区状态按 `data-section` 持久化到 `localStorage`（`fold-collapsed-sections`）
- `tests/workspace-layout-browser.mjs` — 改为验证新布局（原测试检查的旧选择器已移除）

## 4. 已完成内容

- 整体布局：紧凑顶栏（品牌、工程名、保存状态、我的工程、结构库、打开、保存、RGB/CMYK、主题、快捷键、帮助、导出），单一设计工具栏，左侧结构/尺寸/纸张与全高图层树，中间平面刀版与三维预览双窗格，右侧属性检查器。
- 视觉风格：统一的主题变量，五套主题；对话框、下拉菜单、选择框、提示信息样式统一。
- 对话框：帮助、GLB 导出（选项卡片）、结构库（分类、搜索、空状态、回车选择第一项）、工程库（当前工程高亮）、标志库（跟随主题）、SVG 源码、裁剪、编辑菜单。
- 响应式：≥1180px 三栏；860–1180px 侧栏为抽屉；<860px 单列堆叠，工具栏可横向滚动。
- 保留原有功能与元素 ID：33 款模型、参数化刀版、三维折叠、SVG 编辑/导入/解组、文字与图层操作、内外双面、工程保存、本机工程库与历史版本、撤销重做、SVG/PNG/GLB 导出、关闭保护，全部仅使用浏览器本地存储。

## 5. 测试结果（针对 `86f8b5a` 的代码）

- `node --check src/main.js`：通过
- 单元测试 `node --test tests/*.test.js`：149 / 149 通过
- 生产构建 `vite build`：通过（单个 JS 块超过 500 kB 的警告在基线已存在）
- 浏览器测试（`LOCALAPPDATA=/tmp/la FOLD_BROWSER_PATH=/usr/bin/chromium`，每个文件超时 900 秒）：
  - 通过（16）：`svg-main`、`svg-gestures`（31 个场景）、`svg-layers`、`svg-layers-edgecases`、`svg-ungroup`、`svg-editor-workflow`、`svg-workspace`、`export-svg`、`close-protection`、`legacy-project`、`model-selection`（33 款）、`workspace-layout`、`selected-models`、`export-glb`、`theme-and-boxes`、`curved-carton`
  - 失败（6，与基线相同，非本次引入）：`svg-common`、`export-flat`、`color-ui`、`transform-controls`（与基线失败位置一致）；`surfaces`（第 24 行）、`packaging-features`（第 80 行）在基线代码构建后同样于相同行失败，测试仍在查找已不再显示的旧图层列表元素
  - 未在本轮运行：`browser.mjs`、`editor-browser.mjs`、`paper-bag-browser.mjs`、`reference-cartons-browser.mjs`、`rigid-reference-cartons-browser.mjs`、`slotted-handle-carton-browser.mjs`、`import-svg-standalone.mjs`
- 人工截图检查：1440、1024、390 宽度，浅色与 slate 主题，无控制台错误

## 6. 未完成事项

- 推送 `figma/ui-redesign` 到 GitHub 并确认远端收到提交（被失效令牌阻止）。
- 运行上面列出的未运行浏览器测试。
- 6 个基线即失败的浏览器测试需要更新或修复（不属于本次重构引入的问题）。
- 后续打磨：工具栏、图层面板、属性面板的细节；导出、源码、快捷键、确认对话框的进一步打磨；平板与手机布局的进一步实机检查。
- 主分支合并与正式上线交由 Codex 处理。

## 7. 未提交改动

- 代码：无。所有重构代码均已提交到 `86f8b5a`。
- 未跟踪文件 `.figma/README.md`、`.figma/make/site.json`：属于用户文件，按要求不提交，保留原样。
- `dist/`、`artifacts/` 为构建或测试产物，已被 `.gitignore` 忽略。

## 8. Git bundle

`artifacts/fold-studio-ui-redesign.bundle` 包含 `figma/ui-redesign` 分支自基线以来的完整提交历史（含三个删除记录）。导入方法：

```sh
git bundle verify fold-studio-ui-redesign.bundle   # 需要本地仓库已有 cb71ef3
git fetch fold-studio-ui-redesign.bundle figma/ui-redesign:figma/ui-redesign
git push -u origin figma/ui-redesign
```

若本地仓库没有基线提交，使用完整 bundle `artifacts/fold-studio-ui-redesign-full.bundle`（包含全部历史），可直接 `git clone`。
