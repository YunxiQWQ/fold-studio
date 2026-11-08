# 工具导航首页接入

导航页独立放在 `toolbox/`，使用自己的依赖与锁文件。折间源码及离线单文件继续沿用原构建；一个 Vercel 项目交付两个独立入口。

| 访问路径 | 构建文件 |
| --- | --- |
| `/` | `dist/toolbox/index.html` |
| `/toolbox/assets/*` | 导航页资源 |
| `/fold`、`/fold/` | `dist/index.html` |
| `/assets/*`、`/fold/assets/*` | 折间资源 |

`vercel.json` 将首页改为导航页，不再重定向到折间。折间已有路径保留，不增加把未知路径吞进导航页的通配回退。首页只访问自己的资源，不加载折间的编辑器或 ICC 引擎。

## 本地预览

```powershell
npm ci
npm run build:site
node server.mjs --port 4195
```

首页为 `http://127.0.0.1:4195/`，折间为 `/fold`。原“启动折间”快捷启动方式仍直接打开编辑器。仅执行 `npm run build` 会生成折间专用构建；同时需要导航页时执行 `npm run build:site`。

Vercel 使用 `npm run build:site`：先构建折间和离线 HTML，再按导航页的锁文件安装依赖、检查类型并构建至独立子目录。构建直接使用已提交的盒型预览，不依赖部署环境安装浏览器。

## 验证

- `npm run test:toolbox`：启动实际静态服务器，检查首页／编辑器路由、资源、404、桌面布局、鼠标／键盘、减少动效、隐私，以及经首页往返后保留已保存的折间工程。
- 首页测试可设置 `FOLD_SITE_TEST_URL` 使用指定站点根地址。
- 原编辑器专项使用 `FOLD_TEST_URL=http://127.0.0.1:4195/fold`；导航页不会被当成编辑器加载。

## 导入来源

用户提供的 `雲溪工具箱导航页.zip`，SHA-256：`D3C50A185FAD9E47607C1CBF0C16476A265F1D535A0960BEB5928F97E3DE052B`。导入页面组件与样式；构建使用本地独立配置。Figma 环境脚本、站点配置、编辑器指令和原压缩包未随网站发布。帧匣的入口与功能说明按公开仓库 README 和发行信息核对；功能图为示意图。
