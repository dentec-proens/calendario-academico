import {createClient} from '@supabase/supabase-js';
const check=result=>{if(result.error)throw Object.assign(Error('Armazenamento indisponível. Tente novamente.'),{status:503});return result.data;};
export async function cloudFiles(url,key){
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),bucket='dentec-private';
 const existing=await client.storage.getBucket(bucket);
 if(existing.error){const created=await client.storage.createBucket(bucket,{public:false,fileSizeLimit:8_000_000,allowedMimeTypes:['application/pdf']});if(created.error)check(await client.storage.getBucket(bucket));}
 const actual=check(await client.storage.getBucket(bucket));if(actual.public)throw Error('O armazenamento documental precisa ser privado.');
 const files=client.storage.from(bucket);
 return {
  uploadUrl:async path=>check(await files.createSignedUploadUrl(path,{upsert:false})).signedUrl,
  async read(path){const blob=check(await files.download(path));if(blob.size>8_000_000)throw Object.assign(Error('Arquivo maior que 8 MB.'),{status:400});return Buffer.from(await blob.arrayBuffer());},
  async write(path,bytes){check(await files.upload(path,bytes,{contentType:'application/pdf',upsert:false}));},
  signed:async(path,filename)=>check(await files.createSignedUrl(path,60,{download:filename})).signedUrl
 };
}
