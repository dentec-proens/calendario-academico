import {randomBytes,createHash} from 'node:crypto';
const invalid=()=>{throw Object.assign(Error('Convite inválido, expirado ou já utilizado. Solicite um novo ao administrador.'),{status:400});};
const digest=token=>createHash('sha256').update(token).digest('hex');
export function issueInvitation(db,userId,actor,now=Date.now()){
 const user=db.users.find(u=>u.id===userId&&!u.removedAt&&u.loginMethod==='invite'&&!u.active);if(!user)invalid();
 db.invitations??=[];for(const invite of db.invitations)if(invite.userId===userId&&!invite.usedAt)invite.revoked=true;
 const token=randomBytes(32).toString('base64url'),expiresAt=now+48*60*60*1000;
 db.invitations.push({tokenHash:digest(token),userId,expiresAt,createdBy:actor,createdAt:now,revoked:false});
 user.inviteExpiresAt=expiresAt;return {token,expiresAt};
}
export function findInvitation(db,token,now=Date.now()){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))invalid();
 const invite=(db.invitations||[]).find(i=>i.tokenHash===digest(token)&&!i.revoked&&!i.usedAt&&i.expiresAt>now);
 const user=invite&&db.users.find(u=>u.id===invite.userId&&!u.removedAt&&!u.active&&u.loginMethod==='invite');if(!user)invalid();
 return {invite,user};
}
export function acceptInvitation(db,token,email,credentials,now=Date.now()){
 const {invite,user}=findInvitation(db,token,now);
 if(user.email!==String(email||'').trim().toLowerCase())invalid();
 Object.assign(user,credentials,{active:true,loginMethod:'local'});delete user.inviteExpiresAt;invite.usedAt=now;
 db.audit.push({at:new Date(now).toISOString(),actor:user.id,action:'ACCEPT_INVITATION',id:user.id});
 return {id:user.id,email:user.email};
}
