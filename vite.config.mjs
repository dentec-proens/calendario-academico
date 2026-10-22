import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';

export default defineConfig({
 root:fileURLToPath(new URL('./web',import.meta.url)),
 publicDir:false,
 oxc:{jsx:{runtime:'automatic'}},
 build:{
  outDir:fileURLToPath(new URL('./dist/portal',import.meta.url)),
  emptyOutDir:true,
  manifest:true,
  rolldownOptions:{input:fileURLToPath(new URL('./web/portal.html',import.meta.url))},
 },
});
