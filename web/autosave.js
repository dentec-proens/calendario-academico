export function createAutosaver({isDirty,snapshot,write,onSaved,onStatus}){
 let pending=null,blocked=false,paused=false;
 return {
  save(manual=false){
   if(pending)return pending;
   if(blocked){onStatus('blocked');return Promise.resolve();}
   if(paused&&!manual)return Promise.resolve();
   if(!isDirty()&&!manual)return Promise.resolve();
   paused=false;const sent=structuredClone(snapshot());onStatus('saving');
   pending=Promise.resolve().then(()=>write(sent)).then(result=>{
    onSaved(result,sent);onStatus(isDirty()?'pending':'saved',result);
   }).catch(error=>{
    blocked=error.status===409||error.status===401;
    paused=!blocked;
    onStatus(blocked?'blocked':'error',error);
   }).finally(()=>{pending=null;});
   return pending;
  }
 };
}

export async function saveCalendarSnapshot(url,body,{fetcher=fetch,timeoutMs=45000}={}){
 try{
  const response=await fetcher(url,{method:'PUT',headers:{'Content-Type':'application/json','X-Dentec-Request':'1'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
  const raw=await response.text();let data;
  try{data=JSON.parse(raw);}catch{data=null;}
  if(!response.ok)throw Object.assign(Error(data?.error||'O servidor está indisponível. Suas alterações continuam nesta tela.'),{status:response.status});
  if(!data||typeof data.version!=='number')throw Error('O servidor não confirmou o salvamento.');
  return data;
 }catch(error){
  if(error.name==='TimeoutError'||error.name==='AbortError')throw Error('O servidor não confirmou o salvamento a tempo. Antes de tentar novamente, baixe uma cópia de segurança.');
  throw error;
 }
}
