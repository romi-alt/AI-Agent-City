import { stripTypeScriptTypes } from 'node:module';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, relative, dirname, sep } from 'node:path';
const source=resolve(process.argv[2]??'sales-city');
const output=resolve(process.argv[3]??'.audit-runtime');
if(source===output || output.startsWith(source+sep) || source.startsWith(output+sep))throw new Error('Output must be separate from and not contain source');
if(!existsSync(join(source,'src/core/sim.ts')))throw new Error('Expected sales-city source root');
function compile(dir){
 for(const e of readdirSync(dir,{withFileTypes:true})){
  const file=join(dir,e.name);
  if(e.isDirectory()){compile(file);continue;}
  if(!file.endsWith('.ts'))continue;
  const dest=join(output,relative(source,file)).replace(/\.ts$/,'.mjs');
  const js=stripTypeScriptTypes(readFileSync(file,'utf8'),{mode:'strip'})
   .replace(/(from\s+['"])(\.[^'"]+)(['"])/g,(_m,a,b,c)=>a+b.replace(/\.ts$/,'')+'.mjs'+c);
  mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,js);
 }
}
compile(join(source,'src/core'));
for(const name of ['auth.ts','totp.ts']){
 const file=join(source,'server',name),dest=join(output,'server',name.replace('.ts','.mjs'));
 mkdirSync(dirname(dest),{recursive:true});
 writeFileSync(dest,stripTypeScriptTypes(readFileSync(file,'utf8'),{mode:'strip'}).replace(/(from\s+['"])(\.[^'"]+)(['"])/g,(_m,a,b,c)=>a+b.replace(/\.ts$/,'')+'.mjs'+c));
}
console.log('Prepared isolated runtime at '+output+'; original code unchanged. Type stripping is not typechecking.');
