import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';

// Extract only text, never execute document scripts or interpret its contents as instructions.
export async function analyzeHistory(bytes) {
 const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,verbosity:0});
 let timer;const work=(async()=>{
  const pdf=await task.promise;
  if(pdf.numPages>30)throw Error('O PDF tem mais de 30 páginas. Envie somente o calendário.');
  const pages=[];
  for(let page=1;page<=pdf.numPages;page++){
   const content=await (await pdf.getPage(page)).getTextContent();
   const rows=[];
   for(const item of content.items){if(!item.str?.trim())continue;const y=item.transform[5];let row=rows.find(r=>Math.abs(r.y-y)<2);if(!row){row={y,items:[]};rows.push(row);}row.items.push(item);}
   const lines=rows.sort((a,b)=>b.y-a.y).flatMap(row=>{
    const groups=[];let lastEnd=-Infinity;
    for(const item of row.items.sort((a,b)=>a.transform[4]-b.transform[4])){
     if(item.transform[4]-lastEnd>25||(/^\d{1,2}(?:\s*(?:a|-)\s*\d{1,2})?$/.test(item.str)&&/[A-Za-zÀ-ÿ]{3}/.test(groups.at(-1)?.join(' ')||'')))groups.push([]);
     groups.at(-1).push(item.str);lastEnd=item.transform[4]+item.width;
    }
    return groups.map(g=>g.join(' ').replace(/\s+/g,' ').trim());
   });
   pages.push({page,text:lines.join('\n').slice(0,16000)});
  }
  return suggestionsFromPages(pages);
 })();
 try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error('A leitura excedeu o tempo disponível. Tente um PDF menor, com texto selecionável.'));},20000);})]);}
 finally{clearTimeout(timer);await task.destroy();}
}

export function suggestionsFromPages(pages){
 const candidates=[],seen=new Set();
 const keywords=/feriado|municipal|padroeir|anivers[aá]rio|emancipa|funda[çc][aã]o|evento|semana|feira|mostra|jornada|festival|encontro|reuni[aã]o|conselho|forma[çc][aã]o|planejamento|recesso|jogos|gincana|olimp[ií]ada|s[aã]o jo[aã]o|santo ant[oô]nio|nossa senhora/i;
 for(const p of pages)for(const line of p.text.split('\n')){
  if(line.length<8||!keywords.test(line)||/^legenda|^dia da semana|^domingo|^segunda-feira|^terça-feira|^quarta-feira|^quinta-feira|^sexta-feira|^sábado/i.test(line))continue;
  const key=line.toLocaleLowerCase('pt-BR');if(seen.has(key))continue;seen.add(key);
  const holiday=/feriado|padroeir|emancipa/i.test(line);
  candidates.push({page:p.page,excerpt:line.slice(0,650),name:line.replace(/^(?:\d{1,2}\s+){2,}/,'').replace(/^\d{1,2}(?:[\/.]\d{1,2}(?:[\/.]\d{2,4})?)?(?:\s*(?:a|até|-)\s*\d{1,2}(?:[\/.]\d{1,2})?)?\s*[-–:]?\s+/, '').slice(0,160),likelyLocal:/municipal|padroeir|anivers[aá]rio|emancipa/i.test(line),category:holiday?'feriado':/conselho/i.test(line)?'conselho':/recesso/i.test(line)?'recesso':/forma[çc][aã]o/i.test(line)?'formacao':'evento'});
 }
 return {version:1,pages,candidates:candidates.sort((a,b)=>Number(b.likelyLocal)-Number(a.likelyLocal)).slice(0,150),truncated:candidates.length>150,needsText:pages.every(p=>p.text.trim().length<25),analyzedAt:new Date().toISOString()};
}
