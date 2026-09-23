import {createHash,randomBytes} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
export const recoveryMessage='Se houver uma conta ativa com esse e-mail, você receberá um link para redefinir a senha. Confira também a pasta de spam.';
export function manualRecovery(db,userId,actor,origin,now=Date.now()){
 const user=db.users.find(u=>u.id===userId&&u.active&&!u.removedAt&&u.hash&&u.loginMethod!=='google');
 if(!user)throw Object.assign(Error('A recuperação exige uma conta ativa com senha local. Para novos usuários, gere um convite.'),{status:400});
 const token=randomBytes(32).toString('hex'),expiresAt=now+1800000;
 db.passwordResets=(db.passwordResets||[]).filter(r=>r.expires>now&&r.userId!==userId);
 db.passwordResets.push({hash:digest(token),userId,expires:expiresAt});
 db.audit.push({at:new Date(now).toISOString(),actor,action:'ISSUE_PASSWORD_RECOVERY',id:userId});
 return {url:origin+'/recuperar-senha#token='+token,expiresAt,email:user.email};
}
function valid(db,token,now){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return;
 const item=(db.passwordResets||[]).find(r=>r.hash===digest(token)&&r.expires>now&&!r.usedAt);
 const user=item&&db.users.find(u=>u.id===item.userId&&u.active&&!u.removedAt&&u.hash&&u.loginMethod!=='google');
 return user?{item,user}:undefined;
}
export function checkRecovery(db,token,now=Date.now()){
 if(!valid(db,token,now))throw Object.assign(Error('Link inválido, expirado ou já utilizado. Solicite uma nova recuperação.'),{status:400});
}
export function completeRecovery(db,token,credentials,now=Date.now()){
 checkRecovery(db,token,now);const {user}=valid(db,token,now);
 Object.assign(user,credentials);
 db.passwordResets=(db.passwordResets||[]).filter(r=>r.userId!==user.id);
 db.sessions=(db.sessions||[]).filter(s=>s.userId!==user.id);
 for(const invite of db.invitations||[])if(invite.userId===user.id&&!invite.usedAt)invite.revoked=true;
 db.audit.push({at:new Date(now).toISOString(),actor:user.id,action:'RESET_PASSWORD',id:user.id});
}
export async function requestRecovery(store,email,origin,sendMail,now=Date.now()){
 if(!sendMail)throw Object.assign(Error('A recuperação por e-mail ainda não está configurada. Entre em contato com dentec.proens@ifpr.edu.br.'),{status:503});
 const mail=String(email||'').trim().toLowerCase();
 if(mail.length>240||!/^\S+@ifpr\.edu\.br$/.test(mail))return;
 const token=randomBytes(32).toString('hex'),hash=digest(token),key=digest(mail);
 const recipient=await store.change(db=>{
  db.recoveryAttempts=(db.recoveryAttempts||[]).filter(a=>a.until>now);
  const global=db.recoveryAttempts.find(a=>a.key==='global'),local=db.recoveryAttempts.find(a=>a.key===key);
  if((global?.count||0)>=60||(local?.count||0)>=3)return;
  for(const [k,ttl] of [['global',3600000],[key,900000]]){let a=db.recoveryAttempts.find(a=>a.key===k);if(!a){a={key:k,count:0,until:now+ttl};db.recoveryAttempts.push(a);}a.count++;}
  const user=db.users.find(u=>u.email===mail&&u.active&&!u.removedAt&&u.hash&&u.loginMethod!=='google');
  db.passwordResets=(db.passwordResets||[]).filter(r=>r.expires>now);
  if(!user)return;
  db.passwordResets.push({hash,userId:user.id,expires:now+1800000});return user.email;
 });
 if(!recipient)return;
 try{await sendMail({to:recipient,url:origin+'/recuperar-senha#token='+token});}
 catch{
  await store.change(db=>{db.passwordResets=(db.passwordResets||[]).filter(r=>r.hash!==hash);db.audit.push({at:new Date(now).toISOString(),actor:'system',action:'PASSWORD_RECOVERY_DELIVERY_FAILED',id:'mail'});});
  console.error('DENTEC_RECOVERY_EMAIL_FAILED');
 }
}
