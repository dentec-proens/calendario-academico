export function createAutosaver({isDirty,snapshot,write,onSaved,onStatus}){
 let pending=null,blocked=false;
 return {
  save(manual=false){
   if(pending)return pending;
   if(blocked){onStatus('blocked');return Promise.resolve();}
   if(!isDirty()&&!manual)return Promise.resolve();
   const sent=structuredClone(snapshot());onStatus('saving');
   pending=Promise.resolve().then(()=>write(sent)).then(result=>{
    onSaved(result,sent);onStatus(isDirty()?'pending':'saved',result);
   }).catch(error=>{
    blocked=error.status===409||error.status===401;
    onStatus(blocked?'blocked':'error',error);
   }).finally(()=>{pending=null;});
   return pending;
  }
 };
}
