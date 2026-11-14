import {readFileSync} from 'node:fs';
import {TEMPLATE_CATALOG} from '../src/template-catalog.js';

export const ORIGIN='https://tool.heyunxi.top';
export const FOLD_URL=ORIGIN+'/fold';
export const GUIDE_URL=FOLD_URL+'/guide';
export const FOLD_TITLE='折间 Fold Studio｜免费在线包装刀版设计与3D折叠预览';
export const FOLD_DESCRIPTION='折间是免费开源的在线包装设计工具，支持参数化盒型刀版、SVG与文字图片编辑、实时3D折叠预览，以及PNG、SVG、PDF和GLB导出。无需注册，工程保存在本机浏览器。';
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
export const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const image=ORIGIN+'/social/fold-studio.png';
const application={
  '@type':'WebApplication','@id':FOLD_URL+'#application',name:'折间 Fold Studio',url:FOLD_URL,
  description:FOLD_DESCRIPTION,inLanguage:'zh-CN',applicationCategory:'DesignApplication',operatingSystem:'Web',softwareVersion:version,
  isAccessibleForFree:true,offers:{'@type':'Offer',price:'0',priceCurrency:'CNY'},
  license:'https://github.com/YunxiQWQ/fold-studio/blob/main/LICENSE',sameAs:'https://github.com/YunxiQWQ/fold-studio',
  screenshot:image,featureList:['参数化包装结构与刀版','可编辑SVG图层、文字与图片','实时三维折叠预览','浏览器本机工程保存','PNG、SVG、PDF及GLB导出'],
};
const faq=[
  ['折间是免费工具吗？','折间免费使用，以 MIT 协议开源。打开桌面浏览器即可设计，无需注册账号。'],
  ['怎样生成包装刀版？','进入编辑器，在结构库选择盒型或容器，再调整长、宽、高与结构参数。刀版和三维模型会跟随尺寸更新。'],
  ['可以导入 SVG 并继续编辑吗？','可以。常见 SVG 的文字、路径和图形可作为图层编辑，也可组合、解组、排列与对齐；复杂 SVG 效果的支持范围见开源仓库的 SVG 支持说明。'],
  ['工程文件保存在哪里？','工程自动备份在当前浏览器的本机存储中，不上传到服务器。重要设计可下载为 .fold 工程，之后重新打开，或手动带到另一台设备继续编辑。'],
  ['可以导出哪些文件？','可导出可编辑 SVG、平面 PNG、JPG、PDF 与三维 GLB。CMYK 模式提供 ICC 软打样及四色 JPG／PDF；SVG 的色域显示仍以 RGB 表达。模型和刀版用于视觉设计与结构预览。'],
];
function guide(){
  const categories={carton:'卡纸彩盒',gift:'精品礼盒',shipping:'电商物流',container:'瓶罐容器'};
  const catalog=Object.entries(categories).map(([id,label])=>`<div><h3>${label}</h3><p>${Object.values(TEMPLATE_CATALOG).filter(t=>t.category===id).map(t=>escapeHTML(t.name)).join('、')}</p></div>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>折间使用指南｜包装刀版设计、SVG编辑与3D预览</title><meta name="description" content="了解折间在线包装设计工具：选择盒型、编辑SVG刀版、检查三维折叠、保存本机工程，以及导出SVG、PNG、PDF和GLB。"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${GUIDE_URL}"><link rel="icon" href="/favicon.svg"><meta property="og:title" content="折间使用指南与功能介绍"><meta property="og:type" content="article"><meta property="og:url" content="${GUIDE_URL}"><meta property="og:image" content="${image}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${image}"><script type="application/ld+json">${json({'@context':'https://schema.org','@type':'WebPage',name:'折间使用指南与功能介绍',url:GUIDE_URL,inLanguage:'zh-CN',about:{'@id':FOLD_URL+'#application'}})}</script><style>
  *{box-sizing:border-box}body{margin:0;background:#faf9f6;color:#28362c;font:16px/1.85 system-ui,'Microsoft YaHei',sans-serif}a{color:#365940;text-underline-offset:4px}a:focus-visible{outline:2px solid #365940;outline-offset:5px}header,main,footer{max-width:1040px;margin:auto;padding:28px 40px}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dce1d9}nav{display:flex;gap:24px}h1{font-size:42px;line-height:1.3;margin:24px 0}h2{font-size:25px;margin:0 0 20px}h3{font-size:18px;margin:20px 0 8px}p{margin:8px 0 16px}.lead{font-size:19px;color:#55655a}.action{display:inline-block;padding:10px 24px;background:#365940;color:white;border-radius:8px;text-decoration:none;font-weight:600}.hero{padding:24px 0 36px}.hero-links{display:flex;gap:24px;align-items:center;margin-top:24px}section{padding:36px 0;border-top:1px solid #dce1d9}.features{display:grid;grid-template-columns:1fr 1fr;gap:12px 32px}figure{margin:28px 0 0}img{display:block;width:100%;height:auto;border:1px solid #dce1d9;border-radius:12px}figcaption,footer{font-size:13px;color:#67766c}ol{padding-left:24px}footer{border-top:1px solid #dce1d9}.catalog p{color:#55655a;font-size:14px}main{padding-top:12px}footer a{margin-right:20px}
  </style></head><body><header><a href="/" aria-label="返回雲溪工具箱">雲溪工具箱</a><nav aria-label="折间导航"><a href="/fold">打开编辑器</a><a href="https://github.com/YunxiQWQ/fold-studio">GitHub 源码</a></nav></header><main><div class="hero"><p>FOLD STUDIO · 免费开源</p><h1>折间：在线包装刀版设计与3D折叠预览</h1><p class="lead">从包装结构，到平面排版，再到折叠成型。让设计在同一个浏览器窗口中连接起来。</p><p>${FOLD_DESCRIPTION}</p><div class="hero-links"><a class="action" href="/fold">开始使用折间</a><a href="#how-to">查看使用步骤</a></div><figure><img src="/social/fold-studio.png" width="1600" height="1000" alt="折间包装设计工作台：左侧调整结构，中间编辑刀版，右侧预览三维折叠" fetchpriority="high"><figcaption>桌面浏览器中的刀版编辑与三维折叠工作台。</figcaption></figure></div><section><h2>可以用折间做什么？</h2><div class="features"><div><h3>参数化包装结构</h3><p>从 ${Object.keys(TEMPLATE_CATALOG).length} 个结构预设中选择盒型或容器，调整尺寸、插舌、粘口及相应结构参数。</p></div><div><h3>编辑 SVG 与平面设计</h3><p>置入可编辑 SVG、文字和图片，使用图层、对齐、组合、缩放和智能吸附完成排版。</p></div><div><h3>实时三维折叠</h3><p>从展开刀版到成型模型，检查内外面图文在折叠后的对应关系。</p></div><div><h3>本机保存与导出</h3><p>浏览器自动备份工程，也可下载 .fold 文件。按用途导出 SVG、PNG、JPG、PDF 或 GLB。</p></div></div></section><section id="how-to"><h2>四步完成一份包装设计</h2><ol><li>打开结构库，选择盒型，填写盒身尺寸与结构参数。</li><li>在外面和内面置入文字、图片或 SVG，调整图层与排版。</li><li>拖动折叠进度，旋转三维视图，检查盖片和图案的位置。</li><li>保存 .fold 工程备份，再选择所需的平面、印刷或三维格式导出。</li></ol><a class="action" href="/fold">进入编辑器实践</a></section><section class="catalog"><h2>支持哪些包装结构？</h2>${catalog}</section><section><h2>常见问题</h2>${faq.map(([q,a])=>`<div><h3>${escapeHTML(q)}</h3><p>${escapeHTML(a)}</p></div>`).join('')}</section><section><h2>查看支持范围与源码</h2><p><a href="https://github.com/YunxiQWQ/fold-studio/blob/main/SVG_SUPPORT.md">SVG 支持范围</a> · <a href="https://github.com/YunxiQWQ/fold-studio/blob/main/docs/print-color.md">印刷色彩说明</a> · <a href="https://github.com/YunxiQWQ/fold-studio">GitHub 开源仓库</a></p></section></main><footer><a href="/">返回工具导航</a><a href="/fold">打开折间</a>免费开源 · 工程保存在本机浏览器</footer></body></html>`;
}
export function foldSeo(){return {
  name:'fold-search-metadata',
  transformIndexHtml(html){return {html:html.replace('%FOLD_TITLE%',escapeHTML(FOLD_TITLE)).replace('%FOLD_DESCRIPTION%',escapeHTML(FOLD_DESCRIPTION)),tags:[
    {tag:'link',attrs:{rel:'canonical',href:FOLD_URL},injectTo:'head'},
    ...Object.entries({'robots':'index,follow,max-image-preview:large','twitter:card':'summary_large_image','twitter:title':FOLD_TITLE,'twitter:description':FOLD_DESCRIPTION,'twitter:image':image}).map(([name,content])=>({tag:'meta',attrs:{name,content},injectTo:'head'})),
    ...Object.entries({'og:type':'website','og:site_name':'雲溪工具箱','og:locale':'zh_CN','og:title':FOLD_TITLE,'og:description':FOLD_DESCRIPTION,'og:url':FOLD_URL,'og:image':image,'og:image:width':'1600','og:image:height':'1000','og:image:alt':'折间包装刀版与三维折叠工作台'}).map(([property,content])=>({tag:'meta',attrs:{property,content},injectTo:'head'})),
    {tag:'script',attrs:{type:'application/ld+json'},children:json({'@context':'https://schema.org',...application}),injectTo:'head'},
  ]};},
  generateBundle(){
    this.emitFile({type:'asset',fileName:'robots.txt',source:`User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`});
    this.emitFile({type:'asset',fileName:'sitemap.xml',source:`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[FOLD_URL,GUIDE_URL,`${ORIGIN}/huaxin/guide`].map(url=>`<url><loc>${url}</loc></url>`).join('')}</urlset>\n`});
    this.emitFile({type:'asset',fileName:'fold-guide.html',source:guide()});
  },
};}
