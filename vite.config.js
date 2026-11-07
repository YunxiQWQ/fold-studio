import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  optimizeDeps:{exclude:['lcms-wasm']},
  plugins:[{
    name:'lcms-browser-runtime',enforce:'pre',
    transform(source,id){
      if(!id.replaceAll('\\','/').endsWith('/lcms-wasm/dist/lcms.js'))return;
      // The app supplies embedded wasmBinary. Remove only the unused Node and
      // URL loaders so the offline single-file build has no external chunks.
      return source.replace('typeof process=="object"&&typeof process.versions=="object"&&typeof process.versions.node=="string"','false')
        .replace('await import("module")','{createRequire:()=>{throw new Error("Node loader unavailable in browser")}}')
        .replace('new URL("lcms.wasm",import.meta.url).href','"lcms.wasm"')
        .replace('new URL("./",import.meta.url)','{href:"./"}');
    }
  }],
});
