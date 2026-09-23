import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
export function persistentSessions(store){return {
 async get(token){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return undefined;return (await store.read()).sessions?.find(s=>s.id===digest(token)&&s.expires>Date.now());},
 async set(token,value){await store.change(db=>{db.sessions=(db.sessions||[]).filter(s=>s.expires>Date.now()&&s.id!==digest(token));db.sessions.push({id:digest(token),...value});});},
 async delete(token){if(!token)return;await store.change(db=>{db.sessions=(db.sessions||[]).filter(s=>s.id!==digest(token)&&s.expires>Date.now());});}
};}
export async function consumeLoginAttempt(store,key,now=Date.now()){
 return store.change(db=>{db.loginAttempts=(db.loginAttempts||[]).filter(a=>a.until>now);const id=digest(key);let item=db.loginAttempts.find(a=>a.id===id);if(!item){item={id,count:0,until:now+900000};db.loginAttempts.push(item);}item.count++;return item.count<=15;});
}
