export function removeMember(db,id,actor,now=new Date().toISOString()){
 const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
 const user=db.users.find(u=>u.id===id&&!u.removedAt);
 if(!user)fail('Membro não encontrado.',404);
 if(id===actor)fail('Você não pode excluir seu próprio acesso.');
 if(user.role==='ADMIN'&&user.active&&db.users.filter(u=>u.role==='ADMIN'&&u.active&&!u.removedAt).length<=1)fail('É necessário manter um administrador ativo.');
 user.active=false;user.removedAt=now;delete user.inviteExpiresAt;
 for(const invite of db.invitations||[])if(invite.userId===id)invite.revoked=true;
 db.sessions=(db.sessions||[]).filter(s=>s.userId!==id);
 db.audit.push({at:now,actor,action:'REMOVE_MEMBER',id});
}
