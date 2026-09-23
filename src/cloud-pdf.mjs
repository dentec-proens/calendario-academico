import {readFile} from 'node:fs/promises';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import {proensLayout} from '../web/print.mjs';
import {calendarResult} from './pdf.mjs';
export async function cloudPdf(record,events){
 const css=await readFile(new URL('../web/proens.css',import.meta.url),'utf8'),logo=await readFile(new URL('../web/ifpr-logo.png',import.meta.url));
 let result=null;try{result=calendarResult(record.state,events);}catch{}
 const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:0}'+css+'</style><body>'+proensLayout(record.state,events,result,record,'data:image/png;base64,'+logo.toString('base64'))+'</body></html>';
 const browser=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:'shell'});
 try{const page=await browser.newPage();await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith('data:')?r.continue():r.abort());await page.setContent(html,{waitUntil:'load'});return Buffer.from(await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true}));}finally{await browser.close();}
}
