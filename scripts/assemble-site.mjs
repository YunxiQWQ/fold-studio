import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const fold=await readFile(resolve('dist/index.html'),'utf8');
const homepage=await readFile(resolve('dist/toolbox/index.html'),'utf8');
if(!fold.includes('id="app"')||!homepage.includes('id="root"')||!homepage.includes('/toolbox/assets/')){
  throw Error('请先按顺序构建折间和工具箱，再组装站点');
}
// Vercel serves existing static files before applying rewrites. Put the actual
// homepage at index.html instead of relying on a rewrite to override Fold.
await writeFile(resolve('dist/fold.html'),fold);
await copyFile(resolve('dist/toolbox/index.html'),resolve('dist/index.html'));
console.log('已组装站点：首页 index.html，折间 fold.html，资源目录保持独立');
