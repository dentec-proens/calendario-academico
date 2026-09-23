export async function filePayload(file,purpose,calendarId){
 if(!file||file.size>8_000_000||!file.name.toLowerCase().endsWith('.pdf'))throw Error('Escolha um PDF de até 8 MB.');
 const mode=await fetch('/api/file-mode');if(!mode.ok)throw Error('Entre novamente para enviar arquivos.');
 if((await mode.json()).direct){
  const response=await fetch('/api/upload-ticket',{method:'POST',headers:{'Content-Type':'application/json','X-Dentec-Request':'1'},body:JSON.stringify({filename:file.name,size:file.size,purpose,calendarId})}),ticket=await response.json();if(!response.ok)throw Error(ticket.error);
  const uploaded=await fetch(ticket.url,{method:'PUT',headers:{'Content-Type':'application/pdf','x-upsert':'false'},body:await file.arrayBuffer()});if(!uploaded.ok)throw Error('Não foi possível enviar o PDF. Tente novamente.');
  return {uploadId:ticket.id};
 }
 const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Não foi possível ler o PDF.'));reader.readAsDataURL(file);});return {data};
}
