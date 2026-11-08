import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {site} from './src/config/tools';

const entities:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>entities[c]);
const homepage=`https://${site.domain}/`;
export default defineConfig({
  base:'/toolbox/',
  build:{outDir:'../dist/toolbox',emptyOutDir:true},
  plugins:[react(),tailwindcss(),{
    name:'toolbox-metadata',
    transformIndexHtml(html){
      return {
        html:html.replace('%TOOLBOX_TITLE%',escape(site.name)).replace('%TOOLBOX_DESCRIPTION%',escape(site.description)),
        tags:[
          {tag:'meta',attrs:{name:'robots',content:site.indexable?'index,follow,max-image-preview:large':'noindex, nofollow'},injectTo:'head'},
          {tag:'link',attrs:{rel:'canonical',href:homepage},injectTo:'head'},
        ],
      };
    },
  }],
});
