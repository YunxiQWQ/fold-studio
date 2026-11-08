# 折间搜索收录维护

本轮只围绕折间：`https://tool.heyunxi.top/fold` 和使用指南 `/fold/guide`。工具导航保留实际可抓取的入口与指南链接；个人主页、博客、帧匣及其他站点不在本轮优化范围内。

## 已配置

- 折间的描述性标题、简介、语言、主地址，以及 Open Graph／Twitter 分享信息。分享图来自隔离浏览器中的默认示例工程，无用户设计或剪贴板数据。
- 应用 HTML 提供可读的加载／无脚本说明；完整功能、四步教程、实际结构预设、工程保存和导出 FAQ 放在公开的静态使用指南中。编辑器帮助中也可打开指南。
- 工具导航在构建时使用同一 React 组件预渲染，客户端再激活交互。无 JavaScript 也能读到实际条目并进入折间；不按爬虫身份替换内容。
- `robots.txt` 允许抓取，指向 `/sitemap.xml`。站点地图仅包含折间和指南两个主地址，不包含个人主页、外部网站、重复别名或不存在的模型页面。
- 声明实际免费 WebApplication 数据，包含用途、平台、版本、许可证、截图与价格。没有添加未经证实的评分／评论，也不承诺获得星级富摘要。

`/fold/`、`/fold.html` 和 `/fold/index.html` 继续可用，并统一声明 `/fold` 为主地址。指南主地址为 `/fold/guide`。不需要为了搜索更换原有工程入口。

## 发布后的提交步骤

首先确认下列 URL 返回正常页面，未被 `noindex` 或响应头禁止索引：

```text
https://tool.heyunxi.top/fold
https://tool.heyunxi.top/fold/guide
https://tool.heyunxi.top/robots.txt
https://tool.heyunxi.top/sitemap.xml
```

1. **Google Search Console**：使用自己的站长账号添加 `https://tool.heyunxi.top/` URL 前缀资源，完成平台要求的归属验证。这里只验证工具子域，不需要修改个人主页或添加整个 `heyunxi.top` 的域名资源。在“站点地图”提交上面的 sitemap；再用网址检查工具检查折间和指南，按平台提供的入口请求编入索引。
2. **必应站长工具**：可导入已验证的 Search Console 资源，或独立验证工具子域，然后提交同一份 sitemap 和这两个页面。
3. **百度搜索资源平台**：登录、添加并验证工具站后提交两个页面；可使用的 sitemap／提交方式以账号实际权限为准。

目前没有这些站长平台的账号会话或归属验证记录，因此代码准备不等于已经提交、抓取或收录。平台产生的公开验证记录／文件需要另行接入；不应把 API 密钥、账号密码写进源码。

提交是发现提示，是否收录及展示由搜索引擎决定。使用站长平台的抓取、索引与展现报告核对结果；不要把一次 `site:` 搜索或工具返回“提交成功”当成完整的收录证明。

## 构建与验证

```powershell
npm run build:site
npm run test:seo
npm run test:toolbox
```

SEO 输出由 `scripts/seo.mjs` 管理。指南的结构列表从当前卡片目录生成；sitemap 未填写虚假的更新时间。导航预渲染由 `toolbox/scripts/prerender.mjs` 完成，不需要部署环境安装浏览器。

## 官方参考

- [Google：JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics?hl=zh-cn)
- [Google：创建和提交站点地图](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?hl=zh-cn)
- [Google：软件应用结构化数据及展示要求](https://developers.google.com/search/docs/appearance/structured-data/software-app?hl=zh-cn)
- [必应：添加和验证站点](https://www2.bing.com/webmasters/help/add-and-verify-site-12184f8b)
- [百度：链接提交与收录边界](https://ziyuan.baidu.com/linksubmit/url/)
