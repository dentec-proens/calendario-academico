import {createHash,randomUUID} from 'node:crypto';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export const documentTypes=['norma','referencia','parecer'];
export const documentMetadata=({data,...item})=>item;
export function documentSnapshot(db,year){return (db.documents||[]).filter(d=>d.year===year&&d.status==='vigente').map(documentMetadata);}
export function registerDocument(db,body,actor){
 const year=Number(body.year);
 if(!Number.isInteger(year)||year<1900||year>9999||!documentTypes.includes(body.type))fail('Informe ano e tipo válidos.');
 for(const [key,max] of [['title',240],['source',1000],['filename',180]])if(typeof body[key]!=='string'||!body[key].trim()||body[key].length>max)fail('Informe título, identificação da fonte e nome do arquivo.');
 if(!body.filename.toLowerCase().endsWith('.pdf')||typeof body.data!=='string'||!body.data.length||body.data.length>10_666_668||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.data))fail('Envie um PDF de até 8 MB.');
 const file=Buffer.from(body.data,'base64');
 if(file.length>8_000_000||file.subarray(0,5).toString()!=='%PDF-')fail('PDF inválido ou maior que 8 MB.');
 db.documents??=[];
 const d={id:randomUUID(),year,type:body.type,title:body.title.trim(),source:body.source.trim(),filename:body.filename.trim(),size:file.length,hash:createHash('sha256').update(file).digest('hex'),data:file.toString('base64'),status:'rascunho',version:1+Math.max(0,...db.documents.filter(d=>d.year===year&&d.type===body.type).map(d=>d.version)),createdAt:new Date().toISOString(),createdBy:actor};
 db.documents.push(d);db.audit.push({at:d.createdAt,actor,action:'UPLOAD_INSTITUTIONAL_DOCUMENT',id:d.id});return documentMetadata(d);
}
export function setDocumentStatus(db,id,body,actor){
 if(body.revision!==db.catalogue.revision)fail('A base mudou. Atualize a lista antes de continuar.',409);
 const d=(db.documents||[]).find(d=>d.id===id);if(!d)fail('Documento não encontrado.',404);
 if(!['vigente','arquivado'].includes(body.status))fail('Situação inválida.');
 if(body.status==='vigente'&&body.confirmed!==true)fail('Confirme a conferência do ano e da aplicabilidade do documento.');
 if(d.status===body.status)return documentMetadata(d);
 const at=new Date().toISOString();
 if(body.status==='vigente')for(const prior of db.documents)if(prior.year===d.year&&prior.type===d.type&&prior.status==='vigente'){prior.status='arquivado';prior.archivedAt=at;}
 d.status=body.status;if(body.status==='vigente'){d.publishedAt=at;d.publishedBy=actor;}else d.archivedAt=at;
 db.catalogue.revision++;db.audit.push({at,actor,action:'SET_INSTITUTIONAL_DOCUMENT_'+body.status.toUpperCase(),id:d.id});return documentMetadata(d);
}
