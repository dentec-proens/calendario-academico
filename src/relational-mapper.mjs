import {isDeepStrictEqual as equal} from 'node:util';
import {randomUUID} from 'node:crypto';
import {relations,rootRelations,rootKeys} from './relational-schema.mjs';
const q=value=>'"'+value.replaceAll('"','""')+'"';
const childKey=(key,field,index)=>key+'/'+encodeURIComponent(field)+'/'+index;
const knownFields=table=>[...Object.keys(relations[table].fields),...Object.keys(relations[table].children||{})];
const isNative=(value,type)=>value===null||value===undefined||type==='text'&&typeof value==='string'||type==='integer'&&Number.isInteger(value)&&value>=-2147483648&&value<=2147483647||type==='double precision'&&typeof value==='number'&&Number.isFinite(value)||type==='boolean'&&typeof value==='boolean'||type==='text[]'&&Array.isArray(value)&&value.every(v=>typeof v==='string')||type==='integer[]'&&Array.isArray(value)&&value.every(v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647)||type==='bytea'&&typeof value==='string'&&Buffer.from(value,'base64').toString('base64')===value;
const isChild=(value,mode)=>value!==null&&value!==undefined&&(mode==='one'||mode==='map'?typeof value==='object'&&!Array.isArray(value):Array.isArray(value)&&(mode==='values'||value.every(item=>item&&typeof item==='object'&&!Array.isArray(item))));
const extras=(table,item)=>Object.fromEntries(Object.entries(item).filter(([field,value])=>!knownFields(table).includes(field)||Object.hasOwn(relations[table].fields,field)&&!isNative(value,relations[table].fields[field])));

function propertyRows(value,path=[],rows=[]){
 const kind=value===null?'null':value===undefined?'undefined':Array.isArray(value)?'array':typeof value;
 if(!['null','undefined','array','object','string','number','boolean'].includes(kind))throw Error('Tipo de extensão não suportado: '+kind);
 if(kind==='number'&&!Number.isFinite(value))throw Error('Número inválido em extensão de dados.');
 rows.push({path,kind,text:kind==='string'?value:null,number:kind==='number'?value:null,boolean:kind==='boolean'?value:null});
 if(kind==='array')for(let i=0;i<value.length;i++)propertyRows(value[i],[...path,String(i)],rows);
 else if(kind==='object')for(const [field,entry] of Object.entries(value))propertyRows(entry,[...path,field],rows);
 return rows;
}
function propertiesFromRows(rows){
 let root;
 for(const row of rows.sort((a,b)=>a.path.length-b.path.length)){
  const value=row.kind==='array'?[]:row.kind==='object'?{}:row.kind==='null'?null:row.kind==='undefined'?undefined:row.kind==='string'?row.text_value:row.kind==='number'?row.number_value:row.boolean_value;
  if(!row.path.length){root=value;continue;}
  let parent=root;for(const field of row.path.slice(0,-1))parent=parent[field];
  Object.defineProperty(parent,row.path.at(-1),{value,enumerable:true,writable:true,configurable:true});
 }
 return root;
}
async function writeProperties(client,table,key,value){
 await client.query('DELETE FROM dentec.record_properties WHERE entity_type=$1 AND record_key=$2',[table,key]);
 if(table!=='root'&&value&&typeof value==='object'&&!Array.isArray(value)&&!Object.keys(value).length)return;
 const rows=propertyRows(value);
 // Bound parameter batches retain arbitrary path keys without dynamic SQL.
 for(let offset=0;offset<rows.length;offset+=150){
  const values=[],parts=rows.slice(offset,offset+150).map(row=>{const start=values.length;values.push(table,key,row.path,row.kind,row.text,row.number,row.boolean);return '('+Array.from({length:7},(_,i)=>'$'+(start+i+1)).join(',')+')';});
  await client.query('INSERT INTO dentec.record_properties(entity_type,record_key,path,kind,text_value,number_value,boolean_value) VALUES '+parts.join(','),values);
 }
}
async function loadProperties(client,table,keys){
 if(!keys.length)return new Map();
 const {rows}=await client.query('SELECT record_key,path,kind,text_value,number_value,boolean_value FROM dentec.record_properties WHERE entity_type=$1 AND record_key=ANY($2::text[])',[table,keys]);
 const groups=new Map();for(const row of rows){if(!groups.has(row.record_key))groups.set(row.record_key,[]);groups.get(row.record_key).push(row);}
 return new Map([...groups].map(([key,items])=>[key,propertiesFromRows(items)]));
}
function scalarValue(value,type){
 if(!isNative(value,type)||value===undefined||value===null)return null;
 if(type==='bytea')return Buffer.from(value,'base64');
 return value;
}
const childEntries=(value,mode)=>mode==='one'?[value]:mode==='values'?value.map(value=>({value})):mode==='map'?Object.entries(value).map(([modality,stages])=>({modality,stages})):value;
async function writeScalar(client,table,key,parent,position,item){
 const descriptor=relations[table],columns=['_key','_parent','_position','_fields','_undefined',...Object.keys(descriptor.fields)],values=[key,parent,position,Object.keys(item),Object.keys(item).filter(k=>item[k]===undefined),...Object.entries(descriptor.fields).map(([field,type])=>scalarValue(item[field],type))];
 await client.query(`INSERT INTO dentec.${table} (${columns.map(q).join(',')}) VALUES (${values.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT (_key) DO UPDATE SET ${columns.slice(1).map(column=>`${q(column)}=EXCLUDED.${q(column)}`).join(',')}`,values);
}
async function deleteRecord(client,table,key){
 const descriptor=relations[table];
 for(const [field,[child]] of Object.entries(descriptor.children||{})){
  const {rows}=await client.query(`SELECT _key FROM dentec.${child} WHERE _parent=$1`,[key+':'+field]);
  for(const row of rows)await deleteRecord(client,child,row._key);
 }
 await client.query('DELETE FROM dentec.record_properties WHERE entity_type=$1 AND record_key=$2',[table,key]);
 await client.query(`DELETE FROM dentec.${table} WHERE _key=$1`,[key]);
}
async function syncRecord(client,table,key,parent,position,after,before,previousPosition=position){
 if(before!==undefined&&equal(before,after)){if(previousPosition!==position)await client.query(`UPDATE dentec.${table} SET _position=$1 WHERE _key=$2`,[position,key]);return;}
 if(!after||typeof after!=='object'||Array.isArray(after))throw Error('Entidade inválida em '+table+'.');
 const descriptor=relations[table],special={};
 // Null and undefined children retain their exact shape without fabricated rows.
 for(const [field,[,mode]] of Object.entries(descriptor.children||{}))if(Object.hasOwn(after,field)&&!isChild(after[field],mode))Object.defineProperty(special,field,{value:after[field],enumerable:true});
 const extra={...extras(table,after),...special};
 const oldSpecial={};for(const [field,[,mode]] of Object.entries(descriptor.children||{}))if(before&&Object.hasOwn(before,field)&&!isChild(before[field],mode))Object.defineProperty(oldSpecial,field,{value:before[field],enumerable:true});
 const oldExtra=before?{...extras(table,before),...oldSpecial}:undefined;
 await writeScalar(client,table,key,parent,position,after);
 if(!equal(extra,oldExtra))await writeProperties(client,table,key,extra);
 for(const [field,[child,mode]] of Object.entries(descriptor.children||{})){
  const nextValue=after[field],oldValue=before?.[field];if(equal(nextValue,oldValue))continue;
  const next=isChild(nextValue,mode)?childEntries(nextValue,mode):[],old=isChild(oldValue,mode)?childEntries(oldValue,mode):[];
  if(table==='calendars'&&field==='versions'&&before){
   if(next.length<old.length||!equal(old,next.slice(0,old.length)))throw Error('O histórico existente não pode ser substituído.');
   for(let i=old.length;i<next.length;i++)await syncRecord(client,child,childKey(key,field,i),key+':'+field,i,next[i]);
   continue;
  }
  if(table==='reviews'&&field==='history'&&before){
   if(next.length<old.length||!equal(old,next.slice(0,old.length)))throw Error('O histórico de pareceres existente não pode ser substituído.');
  }
  for(let i=0;i<Math.max(next.length,old.length);i++){
   const nestedKey=childKey(key,field,i);
   if(i>=next.length)await deleteRecord(client,child,nestedKey);
   else await syncRecord(client,child,nestedKey,key+':'+field,i,next[i],old[i]);
  }
 }
}

async function decodeRows(client,table,rows,options={}){
 if(!rows.length)return [];
 const descriptor=relations[table],metadata=table==='calendar_revisions'&&!options.full;
 const extension=metadata?new Map():await loadProperties(client,table,rows.map(row=>row._key));
 const items=rows.map(row=>{
  const item={},fields=metadata?row._fields.filter(field=>['version','at','catalogueRevision'].includes(field)):row._fields;
  for(const [field,type] of Object.entries(descriptor.fields))if(fields.includes(field)){
   item[field]=row._undefined.includes(field)?undefined:row[field];
   if(type==='bytea'&&item[field]!==null&&item[field]!==undefined)item[field]=Buffer.from(item[field]).toString('base64');
  }
  for(const [field,value] of Object.entries(extension.get(row._key)||{}))Object.defineProperty(item,field,{value,enumerable:true,writable:true,configurable:true});
  return item;
 });
 if(metadata)return items;
 for(const [field,[child,mode]] of Object.entries(descriptor.children||{})){
  if(options.summary&&table==='calendars'&&field!=='state')continue;
  if(options.summary&&table==='calendar_states'&&field!=='modalities')continue;
  const parents=rows.filter((row,i)=>row._fields.includes(field)&&!Object.hasOwn(items[i],field)).map(row=>row._key+':'+field);
  if(!parents.length)continue;
  const result=await client.query(`SELECT * FROM dentec.${child} WHERE _parent=ANY($1::text[]) ORDER BY _position,_order`,[parents]);
  const children=await decodeRows(client,child,result.rows,options),byParent=new Map();
  result.rows.forEach((row,i)=>{if(!byParent.has(row._parent))byParent.set(row._parent,[]);byParent.get(row._parent).push(children[i]);});
  rows.forEach((row,i)=>{
   if(!parents.includes(row._key+':'+field))return;
   const children=byParent.get(row._key+':'+field)||[];
   items[i][field]=mode==='one'?children[0]:mode==='values'?children.map(item=>item.value):mode==='map'?Object.fromEntries(children.map(item=>[item.modality,item.stages])):children;
  });
 }
 if(options.summary&&table==='calendar_states')for(let i=0;i<items.length;i++)items[i]=Object.fromEntries(['year','offer','modalities','campus'].filter(field=>Object.hasOwn(items[i],field)).map(field=>[field,items[i][field]]));
 return items;
}

export async function readRelational(client,options={}){
 const {rows:presence}=await client.query('SELECT name FROM dentec.root_fields ORDER BY name');
 const selected=options.fields||presence.map(row=>row.name),state={},keys=new Map();
 for(const field of selected){
  if(!presence.some(row=>row.name===field))continue;
  const table=Object.hasOwn(rootRelations,field)?rootRelations[field]:undefined;
  if(!table){const props=await loadProperties(client,'root',[field]);if(props.has(field))Object.defineProperty(state,field,{value:props.get(field),enumerable:true,writable:true,configurable:true});continue;}
  if(field==='audit'&&options.appendOnlyAudit){state.audit=[];keys.set(field,[]);continue;}
  const values=[],conditions=['_parent IS NULL'],bind=value=>{values.push(value);return '$'+values.length;};
  if(table==='calendars'&&!options.full){if(options.calendarId)conditions.push('id='+bind(options.calendarId));if(options.campusId)conditions.push('"campusId"='+bind(options.campusId));}
  if(table==='histories'&&!options.full){if(options.calendarId)conditions.push('"calendarId"='+bind(options.calendarId));if(options.campusId)conditions.push('"campusId"='+bind(options.campusId));}
  if(table==='reviews'&&options.calendarId&&!options.full)conditions.push('"calendarId"='+bind(options.calendarId));
  if(table==='sessions'&&options.sessionHash)conditions.push('id='+bind(options.sessionHash));
  if(table==='users'){if(options.userId)conditions.push('id='+bind(options.userId));else if(options.email)conditions.push('email='+bind(options.email));}
  const {rows}=await client.query(`SELECT * FROM dentec.${table} WHERE ${conditions.join(' AND ')} ORDER BY ${table==='audit'?'_order':'_position,_order'}`,values);
  const items=await decodeRows(client,table,rows,options);state[field]=field==='catalogue'?items[0]:items;keys.set(field,rows.map(row=>({key:row._key,position:row._position})));
 }
 return {state,keys};
}
export async function writeRelational(client,before,after,keys=new Map(),options={}){
 for(const field of new Set([...Object.keys(before),...Object.keys(after)])){
  if(equal(before[field],after[field])&&Object.hasOwn(before,field)===Object.hasOwn(after,field))continue;
  const table=Object.hasOwn(rootRelations,field)?rootRelations[field]:undefined;
  if(!Object.hasOwn(after,field)){
   if(field==='calendars')throw Error('Os calendários existentes devem ser preservados.');
   if(field==='audit')throw Error('A auditoria existente não pode ser substituída.');
   if(field==='reviews')throw Error('O histórico de pareceres existente não pode ser substituído.');
   const projected=!options.full&&(field==='histories'&&(options.calendarId||options.campusId)||field==='users'&&(options.userId||options.email)||field==='sessions'&&options.sessionHash);
   if(projected)throw Error('A coleção selecionada deve ser preservada. Remova somente os registros selecionados.');
   if(table){for(const record of keys.get(field)||[])await deleteRecord(client,table,record.key);}else await client.query('DELETE FROM dentec.record_properties WHERE entity_type=$1 AND record_key=$2',['root',field]);
   await client.query('DELETE FROM dentec.root_fields WHERE name=$1',[field]);continue;
  }
  await client.query('INSERT INTO dentec.root_fields(name) VALUES ($1) ON CONFLICT DO NOTHING',[field]);
  if(!table){await writeProperties(client,'root',field,after[field]);continue;}
  const next=field==='catalogue'?[after[field]]:after[field],old=field==='catalogue'?(before[field]?[before[field]]:[]):before[field]||[];
  if(!Array.isArray(next))throw Error('Coleção inválida: '+field);
  const identity=rootKeys[field],oldKeys=keys.get(field)||[],oldById=new Map(old.map((item,i)=>[identity?item[identity]:i,{item,...oldKeys[i]}]));
  const scoped=!!(options.calendarId&&['calendars','histories','reviews'].includes(field)||options.campusId&&['calendars','histories'].includes(field));
  let appendPosition;if(scoped){const result=await client.query(`SELECT coalesce(max(_position),-1)::integer n FROM dentec.${table} WHERE _parent IS NULL`);appendPosition=result.rows[0].n+1;}
  if(field==='calendars'&&(next.length<old.length||old.some((item,i)=>next[i]?.id!==item.id)))throw Error('Os calendários existentes devem ser preservados.');
  if(field==='reviews'&&old.some(review=>!next.some(item=>item.calendarId===review.calendarId)))throw Error('O histórico de pareceres existente não pode ser substituído.');
  if(field==='audit'&&!equal(old,next.slice(0,old.length)))throw Error('A auditoria existente não pode ser substituída.');
  const retained=new Set();
  for(let i=0;i<next.length;i++){
   const id=identity?next[i][identity]:i,previous=oldById.get(id),key=previous?.key||(identity?field+'/'+encodeURIComponent(String(id)):field+'/'+randomUUID());
   if(identity&&(id===undefined||id===null))throw Error('Identificador ausente: '+field);
   if(retained.has(key))throw Error('Identificador duplicado: '+field);retained.add(key);
   const position=scoped?(previous?.position??appendPosition++):i;
   await syncRecord(client,table,key,null,position,next[i],previous?.item,previous?.position);
  }
  for(const record of oldKeys)if(!retained.has(record.key))await deleteRecord(client,table,record.key);
 }
}
export function changedLockKeys(before,after,{calendarId}={}){
 const locks=[];
 for(const field of new Set([...Object.keys(before),...Object.keys(after)])){
  if(equal(before[field],after[field]))continue;
  if(field==='audit')continue; // append-only rows never acquire a common lock
  locks.push(field==='calendars'&&calendarId?'calendar:'+calendarId:'collection:'+field);
 }
 return locks.sort();
}
