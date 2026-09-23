import {mkdtemp,readFile,writeFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {proensLayout} from '../web/print.mjs';
const run=promisify(execFile);
export {evaluateCalendar as calendarResult} from './evaluation.mjs';
import {evaluateCalendar as calendarResult} from './evaluation.mjs';
export async function renderCalendarPdf(record,events){
 const candidates=[process.env.DENTEC_PDF_BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].filter(Boolean);
 let browser;for(const candidate of candidates){try{await access(candidate);browser=candidate;break;}catch{}}
 if(!browser)throw Object.assign(Error('Para baixar PDF, instale Microsoft Edge ou Google Chrome neste computador. A opção Imprimir também permite salvar em PDF.'),{status:503});
 const root=resolve(tmpdir()),directory=await mkdtemp(join(root,'dentec-pdf-'));
 try{
  let result=null;try{result=calendarResult(record.state,events);}catch{}
  const css=await readFile(new URL('../web/proens.css',import.meta.url),'utf8');
  const logo=await readFile(new URL('../web/ifpr-logo.png',import.meta.url));
  const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Calendário PROENS</title><style>body{font-family:Arial,sans-serif;margin:0}'+css+'</style><body>'+proensLayout(record.state,events,result,record,'data:image/png;base64,'+logo.toString('base64'))+'</body></html>';
  const input=join(directory,'calendar.html'),output=join(directory,'calendar.pdf');await writeFile(input,html);
  await run(browser,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--no-pdf-header-footer','--user-data-dir='+join(directory,'profile'),'--print-to-pdf='+output,pathToFileURL(input).href],{windowsHide:true,timeout:60000,maxBuffer:2_000_000});
  const pdf=await readFile(output);if(pdf.subarray(0,5).toString()!=='%PDF-')throw Error('PDF inválido.');return pdf;
 }finally{
  // Only remove the unique temporary directory created for this request.
  if(resolve(directory).startsWith(root+sep)&&directory!==root)await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{});
 }
}
