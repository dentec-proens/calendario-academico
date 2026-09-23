import test from 'node:test';
import assert from 'node:assert/strict';
import {issueInvitation,findInvitation,acceptInvitation} from '../src/invitations.mjs';
test('invites expire, store only a hash, bind to an email and can be used only once',()=>{
 const db={users:[{id:'u',email:'test@ifpr.edu.br',role:'CAMPUS',campusId:'campus',loginMethod:'invite',active:false}],audit:[]};
 const first=issueInvitation(db,'u','admin',1000);assert(!JSON.stringify(db).includes(first.token));
 assert.throws(()=>findInvitation(db,first.token,first.expiresAt));
 const second=issueInvitation(db,'u','admin',2000);assert.throws(()=>findInvitation(db,first.token,2001));
 assert.throws(()=>acceptInvitation(db,second.token,'wrong@ifpr.edu.br',{hash:'test',salt:'test'},2001));assert.equal(db.users[0].active,false);
 acceptInvitation(db,second.token,'test@ifpr.edu.br',{hash:'test',salt:'test'},2001);assert.equal(db.users[0].active,true);assert.equal(db.users[0].role,'CAMPUS');assert.equal(db.users[0].campusId,'campus');
 assert.throws(()=>acceptInvitation(db,second.token,'test@ifpr.edu.br',{hash:'replacement',salt:'test'},2002));assert.equal(db.users[0].hash,'test');assert.throws(()=>issueInvitation(db,'u','admin',2002));
});
