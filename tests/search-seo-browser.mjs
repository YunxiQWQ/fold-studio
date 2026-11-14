import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..'),dir=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/search-seo');mkdirSync(dir,{recursive:true});
let server,output='';
const url=process.env.FOLD_SITE_TEST_URL??await new Promise((yes,no)=>{
  server=spawn(process.execPath,['server.mjs','--port','0'],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});
  const timeout=setTimeout(()=>{server.kill();no(Error(output));},15000);
  server.on('error',e=>{clearTimeout(timeout);no(e);});
  const log=b=>{output+=b;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);yes(match[0]);}};
  server.stdout.on('data',log);server.stderr.on('data',log);
});
const exe=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(exe)?{executablePath:exe}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const noJS=await browser.newContext({javaScriptEnabled:false,viewport:{width:1440,height:1100}});
const page=await noJS.newPage(),checks=[],errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.stack));
const origin='https://tool.heyunxi.top';
const normalize=s=>s.replace(/\r/g,'');
async function head(path,canonical){
  const r=await page.goto(url+path);assert.equal(r.status(),200,path);
  assert.equal(await page.locator('link[rel="canonical"]').count(),1,path);
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),canonical);
  assert.ok(!(await page.locator('meta[name="robots"]').getAttribute('content')).includes('noindex'));
  assert.ok(!(r.headers()['x-robots-tag']??'').includes('noindex'));
  assert.ok((await page.locator('meta[name="description"]').getAttribute('content')).length>20);
  const data=await page.locator('script[type="application/ld+json"]').allTextContents();for(const s of data)JSON.parse(s);return data.map(s=>JSON.parse(s));
}
try{
  await head('/',origin+'/');
  await page.getByRole('heading',{name:'雲溪工具箱',exact:true}).waitFor();
  assert.equal(await page.locator('section[aria-label="工具列表"] h2').count(),3);
  assert.equal(await page.locator('a[href="/fold"]').count(),1);assert.equal(await page.locator('a[href="/fold/guide"]').count(),1);
  assert.ok((await page.content()).includes('下载 Windows 版'));
  await page.screenshot({path:resolve(dir,'homepage-no-javascript.png'),fullPage:true,animations:'disabled'});
  checks.push('tool navigation exposes its actual entries and Fold guide without JavaScript and permits discovery, without personal-site changes');

  await page.locator('a[href="/fold"]').click();
  await page.getByRole('heading',{name:/折间 Fold Studio/}).waitFor();assert.equal(await page.locator('#editor-host').count(),0);
  assert.ok((await page.locator('main').textContent()).includes('无需注册'));
  const app=(await head('/fold',origin+'/fold'))[0];
  assert.equal(app['@type'],'WebApplication');assert.equal(app.name,'折间 Fold Studio');assert.equal(app.offers.price,'0');
  assert.equal(app.applicationCategory,'DesignApplication');assert.ok(!('aggregateRating'in app)&&!('review'in app));
  assert.ok((await page.title()).includes('包装刀版设计'));assert.ok((await page.locator('meta[property="og:image"]').getAttribute('content')).endsWith('/social/fold-studio.png'));
  for(const path of ['/fold/','/fold.html','/fold/index.html'])await head(path,origin+'/fold');
  checks.push('Fold has meaningful no-JavaScript loading content, descriptive title, one canonical across aliases, factual free WebApplication data and no fabricated ratings');

  await head('/fold/guide',origin+'/fold/guide');
  await page.getByRole('heading',{name:'折间：在线包装刀版设计与3D折叠预览',exact:true}).waitFor();
  assert.equal(await page.locator('ol li').count(),4);assert.ok((await page.locator('main').textContent()).includes('43 个结构预设'));
  assert.ok((await page.locator('main').textContent()).includes('工程自动备份在当前浏览器'));
  assert.equal(await page.locator('script[type="module"]').count(),0);
  const raw=await(await page.request.get(url+'/fold/guide')).text();
  const bot=await(await page.request.get(url+'/fold/guide',{headers:{'User-Agent':'Googlebot'}})).text();assert.equal(normalize(raw),normalize(bot));
  await page.screenshot({path:resolve(dir,'guide-no-javascript.png'),fullPage:true});
  await head('/fold/guide/',origin+'/fold/guide');
  checks.push('the public guide works without scripts, contains real steps, supported structures and storage/export answers, and serves identical content to users and crawlers');

  const robots=await page.request.get(url+'/robots.txt');assert.equal(robots.status(),200);assert.ok(robots.headers()['content-type'].includes('text/plain'));
  assert.match(await robots.text(),/Sitemap: https:\/\/tool\.heyunxi\.top\/sitemap\.xml/);assert.ok(!(await robots.text()).includes('Disallow: /'));
  const xml=await page.request.get(url+'/sitemap.xml');assert.equal(xml.status(),200);assert.ok(xml.headers()['content-type'].includes('xml'));
  const urls=[...(await xml.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);assert.deepEqual(urls,[origin+'/fold',origin+'/fold/guide',origin+'/huaxin/guide']);
  // Huaxin is built in its own repository and reached through Vercel's external rewrite.
  // The static local preview serves this repository's pages; deployment checks cover Huaxin.
  for(const address of urls.filter(address=>new URL(address).pathname.startsWith('/fold'))){const path=new URL(address).pathname;await head(path,address);}
  const image=await page.request.get(url+'/social/fold-studio.png');assert.equal(image.status(),200);const png=await image.body();assert.equal(png.readUInt32BE(16),1600);assert.equal(png.readUInt32BE(20),1000);
  assert.equal((await page.request.get(url+'/no-such-seo-page')).status(),404);
  checks.push('robots permits crawling; the sitemap lists Fold, its guide and the Huaxin introduction, the screenshot is available and unknown paths remain 404');

  const client=await browser.newPage({viewport:{width:1440,height:1100}});client.on('pageerror',e=>errors.push(e.stack));
  client.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await client.goto(url);await client.locator('a[href="/fold"]').hover();await client.waitForFunction(()=>getComputedStyle(document.querySelector('header')).backgroundColor==='rgb(255, 68, 22)');
  assert.equal(await client.getByRole('heading',{name:'雲溪工具箱',exact:true}).count(),1);
  await client.locator('a[href="/fold"]').click();await client.locator('#editor-host[data-svg-ready="true"]').waitFor();
  assert.equal(await client.evaluate(()=>window.__foldStudio.editorEngine),'SVG-edit / SVGCanvas 7.4.2');
  assert.equal(await client.locator('#app h1').textContent(),'平面刀版');
  checks.push('prerendered navigation hydrates into the same interactive design without duplicate content or hydration errors; the unchanged editor still starts normally');
  await client.close();assert.deepEqual(errors,[]);
}catch(error){await page.screenshot({path:resolve(dir,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{writeFileSync(resolve(dir,'report.json'),JSON.stringify({checks,errors},null,2));console.log({checks,errors});await browser.close();server?.kill();}
