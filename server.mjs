import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const directory=resolve(dirname(fileURLToPath(import.meta.url)),'dist');
if(!existsSync(resolve(directory,'index.html'))){console.error('没有找到构建文件，请先运行 npm install 和 npm run build。');process.exit(1);}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json; charset=utf-8','.woff2':'font/woff2'};
const server=createServer(async(request,response)=>{
  response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Referrer-Policy','no-referrer');
  response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  try{
    if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
    const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
    if(pathname==='/__health'){response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify({app:'fold-studio',version:'0.9.4'}));return;}
    const file=resolve(directory,`.${pathname==='/'?'/index.html':pathname}`),rel=relative(directory,file);
    if(rel.startsWith('..')||isAbsolute(rel)||pathname.includes('\0')){response.writeHead(403);response.end('Forbidden');return;}
    const info=await stat(file);if(!info.isFile())throw new Error('Not a file');
    response.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Content-Length':info.size,'Cache-Control':pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache'});
    if(request.method==='HEAD')response.end();else createReadStream(file).on('error',()=>response.destroy()).pipe(response);
  }catch{response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});response.end('文件不存在');}
});
const portIndex=process.argv.indexOf('--port'),explicit=portIndex!==-1;
let port=explicit?Number(process.argv[portIndex+1]):4186,attempt=0;
if(!Number.isInteger(port)||port<0||port>65535){console.error('端口无效');process.exit(1);}
server.on('error',error=>{if(error.code==='EADDRINUSE'&&!explicit&&attempt++<15){port++;server.listen(port,'127.0.0.1');}else{console.error(error.message);process.exitCode=1;}});
server.on('listening',()=>{
  const address=`http://127.0.0.1:${server.address().port}`;
  console.log(`\n  折间 Fold Studio\n  ${address}\n\n  仅在本机运行。关闭此窗口或按 Ctrl+C 即可停止。\n`);
  if(process.argv.includes('--open')){
    const [command,args]=process.platform==='win32'?['explorer.exe',[address]]:process.platform==='darwin'?['open',[address]]:['xdg-open',[address]];
    const child=spawn(command,args,{detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>console.log('请在浏览器手动打开上方地址。'));child.unref();
  }
});
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
server.listen(port,'127.0.0.1');
