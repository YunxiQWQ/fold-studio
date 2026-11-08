import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createElement,StrictMode} from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=resolve(root,'../dist/toolbox/index.html');
const server=await createServer({root,mode:'production',server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
try{
  const {default:App}=await server.ssrLoadModule('/src/App.tsx');
  const year=new Date().getFullYear(),markup=renderToString(createElement(StrictMode,null,createElement(App,{year})));
  const html=await readFile(file,'utf8');
  if(!html.includes('<div id="root"></div>'))throw Error('没有找到导航页预渲染入口');
  await writeFile(file,html.replace('<div id="root"></div>',()=>`<div id="root" data-year="${year}">${markup}</div>`));
  console.log('已预渲染工具导航：无需 JavaScript 即可阅读和进入工具');
}finally{await server.close();}
