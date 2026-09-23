import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {initialCatalogue,campusNames} from './institution.mjs';
export async function openStore(directory){
 await mkdir(directory,{recursive:true});const path=join(directory,'database.json');let data;
 try{data=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;data={users:[],campuses:campusNames.map((name,i)=>({id:`campus-${i+1}`,name})),calendars:[],histories:[],audit:[],catalogue:initialCatalogue()};}
 let queue=Promise.resolve();
 return {read:()=>structuredClone(data),change(fn){const job=queue.then(async()=>{const next=structuredClone(data),result=await fn(next);await writeFile(path+'.tmp',JSON.stringify(next),{mode:0o600});await rename(path+'.tmp',path);data=next;return result;});queue=job.catch(()=>{});return job;}};
}
