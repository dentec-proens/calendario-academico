import {requestRecovery,checkRecovery,completeRecovery,recoveryMessage,manualRecovery} from './password-recovery.mjs';
import {analyzeHistory} from './history-analysis.mjs';
import {auditLog} from './audit-log.mjs';
import {calendarName} from './calendar-label.mjs';
import {teacherVacations} from './teacher-vacations.mjs';
import {calendarModalities,modalityLabels} from './modalities.mjs';
import {activityChecklist,mergeLegacyStages} from './obligations.mjs';
import {removeMember} from './members.mjs';
import {releaseReadiness} from './release.mjs';
import {persistentSessions,consumeLoginAttempt} from './session-store.mjs';
import {documentMetadata,documentSnapshot,registerDocument,setDocumentStatus} from './documents.mjs';
import {eventCategory,validCategory} from './categories.mjs';
import {reviewDocument} from './review-export.mjs';
import {reviewSupport,reviewCriteria,reviewStatuses,initialConclusion} from './review.mjs';
import {createGoogleAuth,authorizeGoogleUser} from './google-auth.mjs';
import {issueInvitation,findInvitation,acceptInvitation} from './invitations.mjs';
import http from 'node:http';
import {renderCalendarPdf} from './pdf.mjs';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {openStore} from './store.mjs';
import {inheritedEvents} from './institution.mjs';
import {datesBetween} from './calendar.mjs';
const scrypt=promisify(scryptCallback);
function fail(message,status=400){throw Object.assign(Error(message),{status});}
function text(v,max=240){if(typeof v!=='string'||!v.trim()||v.length>max)fail('Campo obrigatório ou texto muito longo.');return v.trim();}
function email(v){v=text(v).toLowerCase();if(!/^[^\s@]+@ifpr\.edu\.br$/.test(v))fail('Use um e-mail @ifpr.edu.br.');return v;}
async function password(v){if(typeof v!=='string'||v.length<12||v.length>128)fail('A senha deve ter entre 12 e 128 caracteres.');const salt=randomBytes(16).toString('hex');return {salt,hash:(await scrypt(v,salt,64)).toString('hex')};}
const safeUser=({id,name,email,role,campusId,loginMethod,active,inviteExpiresAt})=>({id,name,email,role,campusId,active,inviteExpiresAt,loginMethod:loginMethod||'local'});
function normalize(s){
 if(!s||!Number.isInteger(s.year)||s.year<1900||s.year>9999||!Object.keys(modalityLabels).includes(s.offer)||!['anual','semestral','misto'].includes(s.regime))fail('Ano ou oferta inválidos.');
 if(!Array.isArray(s.periods)||s.periods.length>50||!Array.isArray(s.events)||s.events.length>1000||!Array.isArray(s.weekdays)||s.weekdays.some(d=>!Number.isInteger(d)||d<1||d>5)||new Set(s.weekdays).size!==s.weekdays.length||typeof s.weekConfirmed!=='boolean')fail('Estrutura do calendário inválida.');
 if(s.weekConfirmed){text(s.weekEvidence);if(!s.weekdays.length)fail('Semana letiva vazia.');}
 if(s.assessmentStages!==undefined&&![2,3,4].includes(Number(s.assessmentStages)))fail('Escolha duas, três ou quatro etapas de avaliação.');
 if(s.modalities!==undefined&&(!Array.isArray(s.modalities)||!s.modalities.length||s.modalities.length>4||new Set(s.modalities).size!==s.modalities.length||s.modalities.some(m=>!Object.hasOwn(modalityLabels,m))))fail('Selecione as formas de oferta/níveis do calendário.');
 s={...s,events:mergeLegacyStages(s.events)};
 if(s.teacherVacations){let vacation;try{vacation=teacherVacations(s.year,s.teacherVacations.julyStart,s.teacherVacations.evidence);}catch(e){fail(e.message);}s.events=s.events.filter(e=>!['teacher-vacation-january','teacher-vacation-july'].includes(e.id)).concat(vacation.events);}
 const ids=new Set();for(const [rows,event]of [[s.periods,false],[s.events,true]])for(const e of rows){text(e.id,100);text(e.name,160);if(ids.has(e.id)||e.id.startsWith('inst:'))fail('Identificador inválido.');ids.add(e.id);datesBetween(e.start,e.end);if(Number(e.start.slice(0,4))!==s.year||Number(e.end.slice(0,4))!==s.year)fail('Data fora do ano.');if(event){if(e.modalities!==undefined&&(!Array.isArray(e.modalities)||!e.modalities.length||e.modalities.some(m=>!calendarModalities(s).includes(m))))fail('Forma de oferta/nível do evento fora do calendário.');if(e.requirementId&&!/^stage-(start|end)-[1-4]$/.test(e.requirementId)&&!activityChecklist(s).some(r=>r.id===e.requirementId))fail('Vínculo de atividade inválido para esta organização.');if(e.category!==undefined&&!validCategory(e.category))fail('Categoria PROENS inválida.');if(!['include','exclude','note'].includes(e.kind))fail('Efeito inválido.');text(e.evidence);}}
 for(let i=0;i<s.periods.length;i++)for(let j=i+1;j<s.periods.length;j++)if(s.periods[i].start<=s.periods[j].end&&s.periods[i].end>=s.periods[j].start)fail('Períodos sobrepostos.');
 return {schemaVersion:1,teacherVacations:s.teacherVacations?{julyStart:s.teacherVacations.julyStart,evidence:s.teacherVacations.evidence}:undefined,modalities:calendarModalities(s),assessmentStages:s.assessmentStages===undefined?undefined:Number(s.assessmentStages),campus:String(s.campus||''),year:s.year,offer:s.offer,regime:s.regime,weekdays:s.weekdays,weekEvidence:String(s.weekEvidence||'').slice(0,240),weekConfirmed:s.weekConfirmed,periods:s.periods.map(({id,name,start,end})=>({id,name,start,end})),events:s.events.map(e=>({historicalSource:e.historicalSource?{historyId:e.historicalSource.historyId,page:e.historicalSource.page}:undefined,modalities:e.modalities,requirementId:e.requirementId||undefined,id:e.id,name:e.name,start:e.start,end:e.end,kind:e.kind,evidence:e.evidence,category:eventCategory(e)}))};
}
export async function createApp({directory,setupEmail=null,files=null,store:providedStore=null,setupCode=randomBytes(16).toString('hex'),pdfRenderer=renderCalendarPdf,googleAuth=createGoogleAuth(null),publicOrigin=null,recoveryMail=null}){
 const store=providedStore||await openStore(directory),sessions=persistentSessions(store);
 if(!(await store.read()).campuses.some(c=>c.name.toLocaleLowerCase('pt-BR')==='reitoria'))await store.change(db=>{if(!db.campuses.some(c=>c.name.toLocaleLowerCase('pt-BR')==='reitoria'))db.campuses.push({id:randomUUID(),name:'Reitoria'});});
 const routes=new Map([['/',['web/portal.html','text/html']],['/calendar-label.mjs',['src/calendar-label.mjs','text/javascript']],['/teacher-vacations.mjs',['src/teacher-vacations.mjs','text/javascript']],['/src/modalities.mjs',['src/modalities.mjs','text/javascript']],['/evaluation.mjs',['src/evaluation.mjs','text/javascript']],['/modalities.mjs',['src/modalities.mjs','text/javascript']],['/obligations.mjs',['src/obligations.mjs','text/javascript']],['/upload.js',['web/upload.js','text/javascript']],['/documents.js',['web/documents.js','text/javascript']],['/logs',['web/logs.html','text/html']],['/logs.js',['web/logs.js','text/javascript']],['/portal.js',['web/portal.js','text/javascript']],['/ativar',['web/activate.html','text/html']],['/activate.js',['web/activate.js','text/javascript']],['/review.js',['web/review.js','text/javascript']],['/portal.css',['web/portal.css','text/css']],['/editor',['web/index.html','text/html']],['/app.js',['web/app.js','text/javascript']],['/style.css',['web/style.css','text/css']],['/calendar.mjs',['src/calendar.mjs','text/javascript']],['/saturdays.mjs',['src/saturdays.mjs','text/javascript']],['/print.mjs',['web/print.mjs','text/javascript']],['/categories.mjs',['src/categories.mjs','text/javascript']],['/src/categories.mjs',['src/categories.mjs','text/javascript']],['/ifpr-logo.png',['web/ifpr-logo.png','image/png']],['/proens.css',['web/proens.css','text/css']]]);
 routes.set('/recuperar-senha',['web/recover.html','text/html']);
 routes.set('/history-dates.mjs',['src/history-dates.mjs','text/javascript']);
 routes.set('/recover.js',['web/recover.js','text/javascript']);
 const handle=async(req,res)=>{
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  try{
   const origin=`http://127.0.0.1:${(server.address()?.port||app.localPort||4173)}`,canonicalOrigin=publicOrigin||googleAuth.config?.origin||origin;
   if(![`127.0.0.1:${(server.address()?.port||app.localPort||4173)}`,`localhost:${(server.address()?.port||app.localPort||4173)}`,new URL(canonicalOrigin).host].includes(req.headers.host))fail('Host inválido.',403);
   const path=new URL(req.url,origin).pathname,method=req.method;
   if(!path.startsWith('/api/')){const a=routes.get(path);if(!a||method!=='GET')fail('Não encontrado.',404);const content=await readFile(new URL('../'+a[0],import.meta.url));res.writeHead(200,{'Content-Type':a[1]+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://*.supabase.co; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(content);return;}
   let body={};if(!['GET','HEAD'].includes(method)){
    if(req.headers.origin&&![origin,origin.replace('127.0.0.1','localhost'),canonicalOrigin].includes(req.headers.origin))fail('Origem inválida.',403);
    if(req.headers['x-dentec-request']!=='1'||!String(req.headers['content-type']).startsWith('application/json'))fail('Requisição inválida.',403);
    let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>12_000_000)fail('Arquivo muito grande.',413);chunks.push(chunk);}try{body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{fail('JSON inválido.');}
   }
   const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('dentec_session='))?.slice('dentec_session='.length),session=await sessions.get(token);
   const user=session&&session.expires>Date.now()?(await store.read()).users.find(u=>u.id===session.userId&&u.active):null;
   const audit=(db,action,id)=>{const calendar=db.calendars.find(c=>c.id===id);db.audit.push({at:new Date().toISOString(),actor:user?.id||'setup',action,id,version:calendar?.version,campusId:calendar?.campusId});};
   const admin=()=>{if(user.role!=='ADMIN')fail('Acesso exclusivo da administração.',403);};
   const owns=c=>{if(!c||c.deletedAt||(user.role!=='ADMIN'&&c.campusId!==user.campusId))fail('Registro não encontrado.',404);if(c.state)c.name=calendarName(c.state.year,c.state.campus);return c;};
   if(path==='/api/invitations/check'&&method==='POST'){
    const db=(await store.read()),{user:invited,invite}=findInvitation(db,body.token);send(200,{name:invited.name,email:invited.email,role:invited.role,campus:db.campuses.find(c=>c.id===invited.campusId)?.name||null,expiresAt:invite.expiresAt});return;
   }
   if(path==='/api/invitations/accept'&&method==='POST'){
    findInvitation((await store.read()),body.token);const credentials=await password(body.password);
    await store.change(db=>acceptInvitation(db,body.token,body.email,credentials));send(200,{ok:true});return;
   }
   if(path==='/api/google/start'&&method==='POST'){
    const start=googleAuth.begin();res.setHeader('Set-Cookie',`dentec_google=${start.binding}; HttpOnly; SameSite=Lax; Path=/api/google; Max-Age=600${canonicalOrigin.startsWith('https:')?'; Secure':''}`);send(200,{url:start.url});return;
   }
   if(path==='/api/google/callback'&&method==='GET'){
    const clear=`dentec_google=; HttpOnly; SameSite=Lax; Path=/api/google; Max-Age=0${canonicalOrigin.startsWith('https:')?'; Secure':''}`;
    try{
     const query=new URL(req.url,origin).searchParams,binding=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('dentec_google='))?.slice('dentec_google='.length);
     const identity=await googleAuth.finish({state:query.get('state'),code:query.get('code'),binding});const account=await authorizeGoogleUser(store,identity);
     const newToken=randomBytes(32).toString('hex');if(token)await sessions.delete(token);await sessions.set(newToken,{userId:account.id,expires:Date.now()+28800000});
     res.writeHead(303,{'Location':'/','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':[clear,`dentec_session=${newToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${canonicalOrigin.startsWith('https:')?'; Secure':''}`]});res.end();
    }catch{res.writeHead(303,{'Location':'/?google_error=1','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':clear});res.end();}return;
   }
   if(path==='/api/status'&&method==='GET'){send(200,{setupRequired:!(await store.read()).users.length,hosted:!!files,googleEnabled:googleAuth.enabled,user:user?safeUser(user):null});return;}
   if(path==='/api/setup'&&method==='POST'){if(body.code!==setupCode||(setupEmail&&String(body.email).trim().toLowerCase()!==setupEmail))fail('Código ou e-mail de instalação incorreto.',403);const credentials=await password(body.password),mail=email(body.email),name=text(body.name);await store.change(db=>{if(db.users.length)fail('Conta ADMIN já criada.',409);db.users.push({id:randomUUID(),name,email:mail,role:'ADMIN',campusId:null,active:true,...credentials});audit(db,'CREATE_ADMIN',mail);});send(201,{ok:true});return;}
   if(path==='/api/password/options'&&method==='GET'){send(200,{emailEnabled:!!recoveryMail});return;}
   if(path==='/api/password/request'&&method==='POST'){
    await requestRecovery(store,body.email,canonicalOrigin,recoveryMail);send(200,{message:recoveryMessage});return;
   }
   if(path==='/api/password/reset'&&method==='POST'){
    checkRecovery(await store.read(),body.token);const credentials=await password(body.password);
    await store.change(db=>completeRecovery(db,body.token,credentials));
    send(200,{message:'Senha alterada. Entre novamente com seu e-mail e a nova senha.'});return;
   }
   if(path==='/api/login'&&method==='POST'){
    const key=String(body.email||'').trim().toLowerCase(),now=Date.now();if(!await consumeLoginAttempt(store,key,now))fail('Muitas tentativas para esta conta. Aguarde 15 minutos.',429);
    const u=(await store.read()).users.find(u=>u.email===String(body.email).toLowerCase().trim()&&u.active);if(typeof body.password!=='string'||body.password.length>128)fail('Credenciais inválidas.',401);const hash=await scrypt(body.password,u?.salt||'invalid',64);if(!u||!u.hash||!timingSafeEqual(hash,Buffer.from(u.hash,'hex')))fail('E-mail ou senha incorretos.',401);
    const token=randomBytes(32).toString('hex');await sessions.set(token,{userId:u.id,expires:now+28800000});res.setHeader('Set-Cookie',`dentec_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${canonicalOrigin.startsWith('https:')?'; Secure':''}`);send(200,{user:safeUser(u)});return;
   }
   if(!user)fail('Entre com sua conta.',401);
   if(path==='/api/file-mode'&&method==='GET'){send(200,{direct:!!files});return;}
   if(path==='/api/upload-ticket'&&method==='POST'){
    if(!files)fail('Envio direto indisponível.',404);
    const filename=text(body.filename,180);if(!filename.toLowerCase().endsWith('.pdf')||!Number.isInteger(body.size)||body.size<5||body.size>8_000_000)fail('Envie um PDF de até 8 MB.');
    if(body.purpose==='document')admin();else if(body.purpose==='history')owns((await store.read()).calendars.find(c=>c.id===body.calendarId));else fail('Finalidade inválida.');
    const ticket={id:randomUUID(),owner:user.id,purpose:body.purpose,calendarId:body.purpose==='history'?body.calendarId:null,filename,size:body.size,expires:Date.now()+3600000};ticket.path='uploads/'+ticket.id+'.pdf';
    await store.change(db=>{db.uploads=(db.uploads||[]).filter(x=>x.expires>Date.now());if(db.uploads.filter(x=>x.owner===user.id).length>=3)fail('Conclua os envios pendentes ou aguarde uma hora.',429);db.uploads.push(ticket);});
    send(201,{id:ticket.id,url:await files.uploadUrl(ticket.path)});return;
   }
   let uploaded=null;
   if(body.uploadId){
    if(!files)fail('Envio direto indisponível.');
    const historyTarget=path.match(/^\/api\/calendars\/([\w-]+)\/history$/);
    if(path==='/api/documents'&&method==='POST')admin();else if(historyTarget&&method==='POST')owns((await store.read()).calendars.find(c=>c.id===historyTarget[1]));else fail('Destino de arquivo inválido.');
    uploaded=(await store.read()).uploads?.find(x=>x.id===body.uploadId&&x.owner===user.id&&x.expires>Date.now());
    if(!uploaded||uploaded.filename!==body.filename||uploaded.purpose!==(historyTarget?'history':'document')||(historyTarget&&uploaded.calendarId!==historyTarget[1]))fail('Envio expirado ou incompatível.');
    const bytes=await files.read(uploaded.path);if(bytes.length!==uploaded.size||bytes.subarray(0,5).toString()!=='%PDF-')fail('Arquivo inválido.');body.data=bytes.toString('base64');
   }
   const attachFile=(db,item)=>{if(!uploaded)return;const index=(db.uploads||[]).findIndex(x=>x.id===uploaded.id&&x.owner===user.id&&x.expires>Date.now());if(index<0)fail('Envio já utilizado ou expirado.',409);delete item.data;item.objectKey=uploaded.path;db.uploads.splice(index,1);};
   const download=async(item)=>{if(!files||!item.objectKey)return false;const url=await files.signed(item.objectKey,item.filename);res.writeHead(302,{Location:url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();return true;};
   if(path==='/api/logout'&&method==='POST'){await sessions.delete(token);res.setHeader('Set-Cookie','dentec_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');send(200,{ok:true});return;}
   if(path==='/api/logs'&&method==='GET'){const offset=Number(new URL(req.url,origin).searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0)fail('Página inválida.');send(200,auditLog(await store.read(),user,offset));return;}
   if(path==='/api/bootstrap'&&method==='GET'){const db=(await store.read());send(200,{user:safeUser(user),campuses:db.campuses.filter(c=>user.role==='ADMIN'||c.id===user.campusId),catalogue:db.catalogue,calendars:db.calendars.filter(c=>!c.deletedAt&&(user.role==='ADMIN'||c.campusId===user.campusId)).map(({state,versions,...c})=>({...c,name:calendarName(state.year,state.campus),year:state.year,offer:state.offer,modalities:calendarModalities(state)})),users:user.role==='ADMIN'?db.users.filter(u=>!u.removedAt).map(safeUser):[]});return;}
   if(path==='/api/calendar-trash'&&method==='GET'){const db=await store.read();send(200,{calendars:db.calendars.filter(c=>c.deletedAt&&(user.role==='ADMIN'||c.campusId===user.campusId)).map(c=>({id:c.id,name:calendarName(c.state.year,c.state.campus),campusId:c.campusId,deletedAt:c.deletedAt,version:c.version}))});return;}
   const lifecycle=path.match(/^\/api\/calendars\/([\w-]+)(?:\/(restore))?$/);
   if(lifecycle&&((method==='DELETE'&&!lifecycle[2])||(method==='POST'&&lifecycle[2]==='restore'))){
    await store.change(db=>{const c=db.calendars.find(c=>c.id===lifecycle[1]);if(!c||(user.role!=='ADMIN'&&c.campusId!==user.campusId))fail('Registro não encontrado.',404);
     if(lifecycle[2]){if(!c.deletedAt)fail('Calendário já está ativo.',409);delete c.deletedAt;delete c.deletedBy;audit(db,'RESTORE_CALENDAR',c.id);}
     else{if(c.deletedAt)fail('Calendário já está na lixeira.',409);if(body.version!==c.version)fail('O calendário foi alterado. Atualize a lista antes de excluir.',409);c.deletedAt=new Date().toISOString();c.deletedBy=user.id;audit(db,'DELETE_CALENDAR',c.id);}
    });send(200,{ok:true});return;
   }
   if(path==='/api/documents'&&method==='GET'){const db=(await store.read());send(200,{revision:db.catalogue.revision,documents:(db.documents||[]).filter(d=>user.role==='ADMIN'||d.publishedAt).map(documentMetadata)});return;}
   if(path==='/api/documents'&&method==='POST'){admin();const item=await store.change(db=>{const metadata=registerDocument(db,body,user.id);attachFile(db,db.documents.find(d=>d.id===metadata.id));return metadata;});send(201,item);return;}
   const documentMatch=path.match(/^\/api\/documents\/([\w-]+)(?:\/(status))?$/);
   if(documentMatch){
    if(documentMatch[2]==='status'&&method==='POST'){admin();const item=await store.change(db=>setDocumentStatus(db,documentMatch[1],body,user.id));send(200,item);return;}
    if(!documentMatch[2]&&method==='GET'){const d=((await store.read()).documents||[]).find(d=>d.id===documentMatch[1]&&(user.role==='ADMIN'||d.publishedAt));if(!d)fail('Documento não encontrado.',404);if(await download(d))return;res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(d.filename),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(Buffer.from(d.data,'base64'));return;}
   }
   if(path==='/api/campuses'&&method==='POST'){admin();const c={id:randomUUID(),name:text(body.name,120)};await store.change(db=>{if(db.campuses.some(x=>x.name.toLowerCase()===c.name.toLowerCase()))fail('Unidade já cadastrada.',409);db.campuses.push(c);audit(db,'CREATE_CAMPUS',c.id);});send(201,c);return;}
   if(path==='/api/users'&&method==='POST'){admin();const role=body.role===undefined?'CAMPUS':body.role;if(!['ADMIN','CAMPUS'].includes(role))fail('Perfil inválido.');const loginMethod=body.loginMethod||'local';if(!['local','google','invite'].includes(loginMethod))fail('Forma de acesso inválida.');const mail=email(body.email),name=text(body.name),credentials=loginMethod==='local'?await password(body.password):{};const created=await store.change(db=>{if(role==='CAMPUS'&&!db.campuses.some(c=>c.id===body.campusId))fail('Campus inválido.');if(db.users.some(u=>u.email===mail&&!u.removedAt))fail('E-mail já cadastrado.',409);const u={id:randomUUID(),name,email:mail,role,campusId:role==='ADMIN'?null:body.campusId,loginMethod,active:loginMethod!=='invite',...credentials};db.users.push(u);audit(db,'CREATE_USER',u.id);if(loginMethod==='invite'){const invitation=issueInvitation(db,u.id,user.id);return {...safeUser(u),inviteUrl:canonicalOrigin+'/ativar#token='+invitation.token};}return safeUser(u);});send(201,created);return;}
   const recoveryMatch=path.match(/^\/api\/users\/([\w-]+)\/password-recovery$/);
   if(recoveryMatch&&method==='POST'){admin();const result=await store.change(db=>manualRecovery(db,recoveryMatch[1],user.id,canonicalOrigin));send(201,result);return;}
   const memberMatch=path.match(/^\/api\/users\/([\w-]+)$/);
   if(memberMatch&&method==='DELETE'){admin();await store.change(db=>removeMember(db,memberMatch[1],user.id));send(200,{ok:true});return;}
   const inviteMatch=path.match(/^\/api\/users\/([\w-]+)\/invitation$/);
   if(inviteMatch&&method==='POST'){
    admin();const invitation=await store.change(db=>{const issued=issueInvitation(db,inviteMatch[1],user.id);audit(db,'REISSUE_INVITATION',inviteMatch[1]);return issued;});send(200,{inviteUrl:canonicalOrigin+'/ativar#token='+invitation.token,inviteExpiresAt:invitation.expiresAt});return;
   }
   if(path==='/api/catalogue'&&method==='POST'){
    admin();const e={id:body.id||randomUUID(),name:text(body.name,160),start:body.start,end:body.end,kind:body.kind,category:text(body.category,40),evidence:text(body.evidence),offers:body.offers,active:body.active!==false};text(e.id,100);if(!validCategory(e.category))fail('Categoria PROENS inválida.');datesBetween(e.start,e.end);if(e.start.slice(0,4)!==e.end.slice(0,4)||!['exclude','include','note'].includes(e.kind)||!Array.isArray(e.offers)||!e.offers.length||e.offers.some(o=>!Object.keys(modalityLabels).includes(o)))fail('Datas, efeito ou ofertas inválidos.');
    await store.change(db=>{if(body.revision!==db.catalogue.revision)fail('Base atualizada por outra sessão. Recarregue.',409);const i=db.catalogue.events.findIndex(x=>x.id===e.id);if(i<0)db.catalogue.events.push(e);else db.catalogue.events[i]=e;db.catalogue.revision++;audit(db,'UPDATE_CATALOGUE',e.id);});send(200,{ok:true});return;
   }
   if(path==='/api/calendars'&&method==='POST'){
    const c=await store.change(db=>{const campus=db.campuses.find(c=>c.id===body.campusId);if(!campus)fail('Campus inválido.');owns({campusId:campus.id});const state=normalize({campus:campus.name,year:Number(body.year),modalities:body.modalities,offer:body.modalities?.[0]||body.offer,regime:body.regime,weekdays:[],weekConfirmed:false,weekEvidence:'',periods:[],events:[]});const c={id:randomUUID(),campusId:campus.id,purpose:body.purpose==='test'?'test':'definitive',name:calendarName(state.year,campus.name),courses:text(body.courses,1000),classes:String(body.classes||'').slice(0,500),shifts:String(body.shifts||'').slice(0,200),state,version:1,versions:[],catalogueRevision:db.catalogue.revision,documentSnapshot:documentSnapshot(db,state.year),institutionalSnapshot:inheritedEvents(db.catalogue,state.year,calendarModalities(state)),updatedAt:new Date().toISOString()};db.calendars.push(c);audit(db,'CREATE_CALENDAR',c.id);return c;});send(201,c);return;
   }
   const reviewMatch=path.match(/^\/api\/reviews\/([\w-]+)(?:\/(export))?$/);
   if(reviewMatch){
    admin();const id=reviewMatch[1],db=(await store.read()),record=owns(db.calendars.find(c=>c.id===id));
    if(reviewMatch[2]==='export'&&method==='POST'){
     const saved=(db.reviews||[]).find(r=>r.calendarId===id);
     if(!saved)fail('Salve a análise inicial ou a revisão antes de exportar.',409);
     if(saved.revision!==body.revision||saved.calendarVersion!==record.version||saved.catalogueRevision!==db.catalogue.revision)fail('A análise está desatualizada. Reabra, confira e salve antes de exportar.',409);
     send(200,reviewDocument(record,saved));return;
    }
    if(!reviewMatch[2]&&method==='GET'){const saved=(db.reviews||[]).find(r=>r.calendarId===id);const support=reviewSupport(record,[...inheritedEvents(db.catalogue,record.state.year,calendarModalities(record.state)),...record.state.events]);send(200,{...support,initialConclusion:initialConclusion(support),catalogueRevision:db.catalogue.revision,review:saved?{...saved,history:undefined}:null,stale:!!saved&&(saved.calendarVersion!==record.version||saved.catalogueRevision!==db.catalogue.revision)});return;}
    if(!reviewMatch[2]&&method==='PUT'){
     const support=reviewSupport(record,[...inheritedEvents(db.catalogue,record.state.year,calendarModalities(record.state)),...record.state.events]);
     if(!Array.isArray(body.entries)||body.entries.length!==reviewCriteria.length||new Set(body.entries.map(e=>e.id)).size!==reviewCriteria.length)fail('Confira todos os critérios da revisão.');
     const entries=body.entries.map(e=>{if(!reviewCriteria.some(c=>c.id===e.id)||!reviewStatuses.includes(e.status))fail('Critério ou situação inválidos.');const notes=String(e.notes||'');if(notes.length>2000)fail('Observação muito longa.');if(e.status!=='PENDENTE'&&!notes.trim())fail('Informe evidência ou justificativa para cada conclusão humana.');if(e.reviewed===false){const initial=support.criteria.find(c=>c.id===e.id).initial;return {...initial};}return {id:e.id,status:e.status,notes,reviewed:true};});
     const conclusion=String(body.conclusion||'');if(conclusion.length>8000)fail('Síntese muito longa.');const processNumber=String(body.processNumber||''),applicableNorm=String(body.applicableNorm||'');if(processNumber.length>100||applicableNorm.length>1000)fail('Identificação do processo ou norma muito longa.');
     const saved=await store.change(db=>{
      const current=owns(db.calendars.find(c=>c.id===id));db.reviews??=[];const prior=db.reviews.find(r=>r.calendarId===id);
      if(body.calendarVersion!==current.version||body.catalogueRevision!==db.catalogue.revision)fail('O calendário ou a base mudou. Reabra a revisão.',409);
      if(body.revision!==(prior?.revision||0))fail('Outro revisor atualizou esta análise. Reabra antes de salvar.',409);
      if(prior&&(prior.calendarVersion!==current.version||prior.catalogueRevision!==db.catalogue.revision)&&body.acknowledgeStale!==true)fail('Confirme a reavaliação das conclusões anteriores após a mudança de versão.',409);
      const {history:oldHistory,...snapshot}=prior||{};
      const next={calendarId:id,calendarVersion:current.version,catalogueRevision:db.catalogue.revision,revision:(prior?.revision||0)+1,source:'SEI 3959640',documentSnapshot:documentSnapshot(db,current.state.year),entries,conclusion,processNumber,applicableNorm,reviewer:{id:user.id,name:user.name},updatedAt:new Date().toISOString(),officialApproval:false,history:prior?[...(oldHistory||[]),snapshot]:[]};
      if(prior)db.reviews[db.reviews.indexOf(prior)]=next;else db.reviews.push(next);audit(db,'SAVE_HUMAN_REVIEW',id);return {revision:next.revision};
     });send(200,saved);return;
    }
   }
   const match=path.match(/^\/api\/calendars\/([\w-]+)(?:\/(history|pdf))?$/);
   if(match){const id=match[1],db=(await store.read()),record=owns(db.calendars.find(c=>c.id===id));
    if(match[2]==='pdf'&&method==='POST'){
     if(body.version!==record.version||body.catalogueRevision!==db.catalogue.revision||record.catalogueRevision!==db.catalogue.revision)fail('Salve a versão atual com a base institucional atualizada antes de baixar.',409);
     const readiness=releaseReadiness(record,db);if(record.purpose!=='test'&&!readiness.ready)fail('Geração definitiva bloqueada. '+readiness.issues.join('\n'),409);
     const pdf=await pdfRenderer({...record,currentCatalogueRevision:db.catalogue.revision},[...record.institutionalSnapshot,...record.state.events]);
     if(files&&pdf.length>4_000_000){const key='exports/'+randomUUID()+'.pdf';await files.write(key,pdf);await download({objectKey:key,filename:`${record.purpose==='test'?'teste-':''}calendario-${record.state.year}-v${record.version}.pdf`});return;}
     res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${record.purpose==='test'?'teste-':''}calendario-${record.state.year}-v${record.version}.pdf"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(pdf);return;
    }
    if(!match[2]&&method==='GET'){send(200,{...record,state:{...record.state,events:mergeLegacyStages(record.state.events)},readiness:releaseReadiness(record,db),versions:record.versions.map(v=>({version:v.version,at:v.at,catalogueRevision:v.catalogueRevision})),institutionalEvents:inheritedEvents(db.catalogue,record.state.year,calendarModalities(record.state)),currentCatalogueRevision:db.catalogue.revision,currentDocuments:documentSnapshot(db,record.state.year),histories:db.histories.filter(h=>h.calendarId===id).map(({data,analysis,objectKey,...h})=>({...h,analyzed:!!analysis}))});return;}
    if(!match[2]&&method==='PUT'){const state=normalize(body.state);if(state.year!==record.state.year||state.offer!==record.state.offer)fail('Ano e oferta não podem mudar neste registro.');state.campus=record.state.campus;const saved=await store.change(db=>{const c=owns(db.calendars.find(c=>c.id===id));if(c.version!==body.version)fail('Há versão mais recente. Reabra o calendário.',409);if(body.catalogueRevision!==db.catalogue.revision)fail('A base institucional mudou. Reabra para incorporar as alterações.',409);for(const event of state.events){const source=event.historicalSource;if(source&&(!Number.isInteger(source.page)||source.page<1||!db.histories.some(h=>h.id===source.historyId&&h.calendarId===id&&h.analysis?.pages.some(p=>p.page===source.page))))fail('Referência histórica inválida para este calendário.');}c.versions.push({version:c.version,state:c.state,at:c.updatedAt,catalogueRevision:c.catalogueRevision,institutionalEvents:c.institutionalSnapshot,documentSnapshot:c.documentSnapshot||[]});c.state=state;c.documentSnapshot=documentSnapshot(db,state.year);c.version++;c.catalogueRevision=db.catalogue.revision;c.institutionalSnapshot=inheritedEvents(db.catalogue,state.year,calendarModalities(state));c.updatedAt=new Date().toISOString();audit(db,'SAVE_CALENDAR',id);return {version:c.version};});send(200,saved);return;}
    if(match[2]==='history'&&method==='POST'){if(Number(body.year)!==record.state.year-1)fail('Informe o ano anterior ao calendário em elaboração.');const filename=text(body.filename,180);if(!filename.toLowerCase().endsWith('.pdf')||typeof body.data!=='string')fail('Envie um PDF.');const file=Buffer.from(body.data,'base64');if(file.length>8_000_000||file.subarray(0,5).toString()!=='%PDF-')fail('PDF inválido ou maior que 8 MB.');const h={id:randomUUID(),calendarId:id,campusId:record.campusId,year:Number(body.year),offer:record.state.offer,filename,data:file.toString('base64'),hash:createHash('sha256').update(file).digest('hex'),notes:String(body.notes||'').slice(0,5000),createdAt:new Date().toISOString()};await store.change(db=>{owns(db.calendars.find(c=>c.id===id));attachFile(db,h);db.histories.push(h);audit(db,'UPLOAD_HISTORY',h.id);});send(201,{id:h.id});return;}
   }
   const analysisMatch=path.match(/^\/api\/history\/([\w-]+)\/analysis$/);
   if(analysisMatch&&method==='POST'){
    const historyDb=await store.read();const h=owns(historyDb.histories.find(h=>h.id===analysisMatch[1]));owns(historyDb.calendars.find(c=>c.id===h.calendarId));
    if(h.analysis?.version===2){send(200,h.analysis);return;}
    let analysis;try{analysis=await analyzeHistory(h.objectKey&&files?await files.read(h.objectKey):Buffer.from(h.data,'base64'));}catch{fail('Não foi possível ler o texto deste PDF. Envie um arquivo sem senha e com texto selecionável. O documento continua guardado para consulta.',422);}
    await store.change(db=>{const current=owns(db.histories.find(x=>x.id===h.id));current.analysis=analysis;audit(db,'ANALYZE_HISTORY',h.id);});send(200,analysis);return;
   }
   const history=path.match(/^\/api\/history\/([\w-]+)$/);if(history&&method==='GET'){const historyDb=await store.read();const h=owns(historyDb.histories.find(h=>h.id===history[1]));owns(historyDb.calendars.find(c=>c.id===h.calendarId));if(await download(h))return;res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(h.filename),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(Buffer.from(h.data,'base64'));return;}
   fail('Não encontrado.',404);
  }catch(e){send(e.status||400,{error:e.status||e instanceof RangeError?e.message:'Não foi possível concluir a operação.'});}
 };const server=http.createServer(handle);const app={server,setupCode,store,handle};return app;
}
