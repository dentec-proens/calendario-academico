export function recoveryMailer(env=process.env,request=fetch){
 if(!env.RESEND_API_KEY||!env.DENTEC_MAIL_FROM)return null;
 return async({to,url})=>{
  const response=await request('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.DENTEC_MAIL_FROM,to:[to],subject:'DENTEC/PROENS — Recuperar senha',text:'Foi solicitada a redefinição da sua senha do calendário DENTEC/PROENS.\n\nAbra este link em até 30 minutos:\n'+url+'\n\nSe você não solicitou, ignore esta mensagem. Sua senha permanece a mesma. Não compartilhe este link.'})});
  if(!response.ok)throw Error('Falha no envio de recuperação.');
 };
}
