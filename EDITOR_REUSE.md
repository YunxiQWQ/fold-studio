# 平面编辑器复用方案

核验日期：2026-10-18。实际安装 `fabric@7.4.0`，版本锁定在 package.json / package-lock.json。

| 方案 | 许可与能力 | 本项目选择 |
| --- | --- | --- |
| [Fabric.js](https://github.com/fabricjs/fabric.js) | MIT；对象交互、变换、多选、组合、文字编辑与裁切 | 直接集成为编辑与共享文字排版引擎 |
| [快图设计 vue-fabric-editor](https://github.com/ikuaitu/vue-fabric-editor) | MIT 的完整 Vue 图片编辑器，提供图层、标尺、裁剪等 UI | 是可复用的完整应用，但整站采用 Vue 与平面页面数据；本项目保留既有原生 JS 工作台和包装模型，直接复用其底层 Fabric 能力，未复制快图源码 |
| [Konva](https://konvajs.org/docs/sandbox/Editable_Text.html) | 有变换组件；官方文字编辑方案使用额外 DOM 输入框 | 本项目更需要现成的画布文字编辑，采用 Fabric |
| [Polotno SDK](https://polotno.com/sdk/pricing) | 完整编辑 SDK，商业授权与可选源码许可 | 本地开源工作台选用 MIT 方案 |

Fabric 是编辑引擎，不是直接嵌入一整套现成设计器 UI。`editor2d.js` 使用真实 Fabric Canvas、ActiveSelection、Textbox 和控制柄；`editor-ui.js` 将批量编辑、图层、裁剪等入口接入当前工作台。包装面板裁切、内面坐标、3D 与项目持久化适配由本项目负责。

v0.9.1 默认使用整张刀版的联合遮罩，允许单个图层跨折线排版与拖动，只有显式选择“仅基准面板”的对象才使用单面裁切。整张刀版遮罩由 Canvas 共享，避免每个对象缓存一份全尺寸遮罩；`artwork-space.js` 统一印刷范围与点击判断，`artwork.js` 用相同范围绘制 3D 与导出贴图。图层的 panel 字段仍保存定位基准，旧工程无需迁移即可跨面。

`text-layout.js` 在平面、3D 图集及导出中复用同一 Textbox 排版；图片裁剪保存原图与归一化裁剪框。图层组合以平面图层上的 group 编号保存，不把 Fabric Canvas、DOM 或缓存写入 .fold 工程。

仍保留工程版本 2 与旧单面工程迁移。新样式、组合、锁定与裁剪作为可选字段保存。完整 Fabric MIT 许可包含在 THIRD_PARTY_NOTICES.md 及离线 HTML 内。无运行时 CDN、在线素材依赖或许可证联网校验。

本轮实现对象与排版编辑；任意刀版节点拓扑编辑、PSD 图层解析和完整矢量钢笔编辑不属于当前已交付功能。

## v0.9.3 调色盘组件

采用 `vanilla-colorful@0.7.2`（MIT，react-colorful 的原生 Custom Elements 移植），直接复用真实 `hex-color-picker` 的色相、饱和度/明度、触控和键盘交互；`color-ui.js` 适配精确输入、色板、最近用色、屏幕取色、场景绑定及历史事务。比较过 Coloris（MIT，输入框和弹出取色器）与 iro.js（MPL-2.0，模块化色轮）；当前原生 JS 工作台采用无框架依赖、界面可组合的 vanilla-colorful。

所有工程颜色仍保存为六位 HEX；图层透明度继续独立保存。CMYK 数值仅作已有转换模型的参考读数。输入验证发生在旧颜色事件处理之前，非法或未完成色值不会进入工程；一次调色会话只提交一次历史，取消按属性快照恢复，多选可恢复不同原色。颜色、描边与纸张均走既有实时绘图流程；新组件和完整 MIT 许可进入离线构建。
