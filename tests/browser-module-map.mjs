// Harness documents are fulfilled directly by Playwright rather than Vite's
// HTML pipeline. Resolve the upstream GLTF loader's bare Three.js imports in
// those documents, including worktrees whose node_modules is a junction.
export async function installBrowserModuleMap(page){
  await page.addScriptTag({type:'importmap',content:JSON.stringify({imports:{three:'/node_modules/three/build/three.module.js'}})});
}
