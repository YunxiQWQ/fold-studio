import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {site} from './src/config/tools';

const entities:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>entities[c]);
export default defineConfig({
  base:'/toolbox/',
  build:{outDir:'../dist/toolbox',emptyOutDir:true},
  plugins:[react(),tailwindcss(),{
    name:'toolbox-metadata',
    transformIndexHtml(html){
      return {
        html:html.replace('%TOOLBOX_TITLE%',escape(site.name)).replace('%TOOLBOX_DESCRIPTION%',escape(site.description)),
        tags:site.indexable?[]:[{tag:'meta',attrs:{name:'robots',content:'noindex, nofollow'},injectTo:'head'}],
      };
    },
  }],
});
