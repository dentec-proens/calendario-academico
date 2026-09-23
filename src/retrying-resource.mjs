// Share one initialization across concurrent requests; recover after transient startup failure.
export function retryingResource(factory,{cooldown=5000,now=Date.now,onError=()=>{}}={}){
 let pending=null,retryAt=0,lastError;
 return ()=>{
  if(pending)return pending;
  if(now()<retryAt)return Promise.reject(lastError);
  pending=Promise.resolve().then(factory).catch(error=>{pending=null;lastError=error;retryAt=now()+cooldown;onError(error);throw error;});
  return pending;
 };
}
