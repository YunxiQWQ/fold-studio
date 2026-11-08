import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const html=await readFile(resolve('dist/fold.html'),'utf8').catch(error=>{
  if(error.code!=='ENOENT')throw error;
  return readFile(resolve('dist/index.html'),'utf8');
});
const script=html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
const stylesheet=html.match(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/);
if(!script||!stylesheet)throw new Error('没有找到可嵌入的构建资源');
const js=await readFile(resolve('dist',script[1].replace(/^\//,'')),'utf8');
const {version}=JSON.parse(await readFile(resolve('package.json'),'utf8'));
if(!js.includes(`v${version}`))throw new Error('构建版本与 package.json 不一致，请重新构建');
const css=await readFile(resolve('dist',stylesheet[1].replace(/^\//,'')),'utf8');
if(/\bimport\s*\(/.test(js))throw new Error('单文件版不支持尚未打包的动态导入');
const favicon=await readFile(resolve('public/favicon.svg'),'utf8');
const iconPattern=/href=["'](?:\.\/|\/)?favicon\.svg["']/;
if(!iconPattern.test(html))throw new Error('没有找到 favicon 引用，离线单文件会缺图标并产生 file:// 404');
const notices=await readFile(resolve('THIRD_PARTY_NOTICES.md'),'utf8');
await writeFile(resolve('dist/THIRD_PARTY_NOTICES.txt'),notices);
// SVGCanvas embeds HTML snippets, including script/comment delimiters. A data
// module keeps those bytes out of the HTML parser's script escape states.
const output=html.replace(script[0],()=>`<script type="module" src="data:text/javascript;base64,${Buffer.from(js).toString('base64')}"></script>`)
  .replace(stylesheet[0],()=>`<style>${css.replace(/<\/style/gi,'<\\/style')}</style>`)
  .replace(iconPattern,()=>`href="data:image/svg+xml,${encodeURIComponent(favicon)}"`)
  .replace('</head>',()=>`<meta name="generator" content="折间 Fold Studio v${version}">\n<!--\n${notices.replace(/--/g,'—')}\n-->\n</head>`);
await writeFile(resolve('折间.html'),output);
console.log(`已生成离线单文件：折间.html（${Math.round(Buffer.byteLength(output)/1024)} KB）`);
