import {isDeepStrictEqual} from 'node:util';
import {completeCalendarsSql} from './postgres-history.mjs';

// Keep the canonical document and its complete history in PostgreSQL. Only a
// projection crosses the network; archived snapshots never accompany normal reads.
export function selectState({fields,calendarId,campusId,sessionHash,userId,email,summary=false,full=false,lock=false,archived=false}={}){
 const values=[],bind=value=>{values.push(value);return '$'+values.length;};
 const root=fields?`(SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(payload) WHERE key = ANY(${bind(fields)}::text[]))`:'payload';
 const projectCalendars=!full&&(!fields||fields.includes('calendars'));
 const conditions=[];
 // Bind calendar filters only when this SELECT actually includes calendars.
 // PostgreSQL rejects unused parameters in narrow campus/session/user reads.
 if(projectCalendars&&calendarId)conditions.push(`c->>'id'=${bind(calendarId)}`);
 if(projectCalendars&&campusId)conditions.push(`c->>'campusId'=${bind(campusId)}`);
 const versionMetadata=`coalesce((SELECT jsonb_agg(jsonb_build_object('version',v->'version','at',v->'at','catalogueRevision',v->'catalogueRevision') ORDER BY n) FROM jsonb_array_elements(coalesce(c->'versions','[]'::jsonb)) WITH ORDINALITY AS versions(v,n)),'[]'::jsonb)`;
 const current=summary?`(c-'versions'-'state'-'institutionalSnapshot'-'documentSnapshot') || jsonb_build_object('state',jsonb_build_object('year',c#>'{state,year}','offer',c#>'{state,offer}','modalities',c#>'{state,modalities}','campus',c#>'{state,campus}'))`:`(c-'versions') || jsonb_build_object('versions',${versionMetadata})`;
 const calendars=`(SELECT coalesce(jsonb_agg(${current} ORDER BY pos),'[]'::jsonb) FROM jsonb_array_elements(coalesce(payload->'calendars','[]'::jsonb)) WITH ORDINALITY AS calendars(c,pos)${conditions.length?' WHERE '+conditions.join(' AND '):''})`;
 let result=root;
 if(full&&archived&&(!fields||fields.includes('calendars')))result=`(${result} || jsonb_build_object('calendars',${completeCalendarsSql}))`;
 if(projectCalendars)result=`(${result} || jsonb_build_object('calendars',${calendars}))`;
 for(const collection of ['histories','reviews'])if(!lock&&(calendarId||campusId)&&(!fields||fields.includes(collection))){
  const filter=[];if(calendarId)filter.push(`item->>'calendarId'=${bind(calendarId)}`);if(campusId&&collection==='histories')filter.push(`item->>'campusId'=${bind(campusId)}`);
  if(filter.length)result=`(${result} || jsonb_build_object('${collection}',(SELECT coalesce(jsonb_agg(item ORDER BY n),'[]'::jsonb) FROM jsonb_array_elements(coalesce(payload->'${collection}','[]'::jsonb)) WITH ORDINALITY AS items(item,n) WHERE ${filter.join(' AND ')})))`;
 }
 if(sessionHash)result=`(${result} || jsonb_build_object('sessions',(SELECT coalesce(jsonb_agg(s),'[]'::jsonb) FROM jsonb_array_elements(coalesce(payload->'sessions','[]'::jsonb)) s WHERE s->>'id'=${bind(sessionHash)})))`;
 if(userId||email)result=`(${result} || jsonb_build_object('users',(SELECT coalesce(jsonb_agg(u),'[]'::jsonb) FROM jsonb_array_elements(coalesce(payload->'users','[]'::jsonb)) u WHERE ${userId?"u->>'id'="+bind(userId):"u->>'email'="+bind(email)})))`;
 const positions=lock&&calendarId?`, ARRAY(SELECT (pos-1)::integer FROM jsonb_array_elements(coalesce(payload->'calendars','[]'::jsonb)) WITH ORDINALITY AS calendars(c,pos) WHERE c->>'id'=${bind(calendarId)} ORDER BY pos) AS calendar_positions`:'';
 return {text:`SELECT ${result} AS payload${positions} FROM dentec_private.app_state WHERE id=1${lock?' FOR UPDATE':''}`,values};
}

export function statePatches(before,after,path=[]){
 if(isDeepStrictEqual(before,after))return [];
 if(after===undefined)return [{path,remove:true}];
 if(path.at(-1)==='versions'&&Array.isArray(before)){
  if(!Array.isArray(after)||after.length<before.length||!isDeepStrictEqual(before,after.slice(0,before.length)))throw Error('O histórico existente não pode ser substituído.');
  return after.length===before.length?[]:[{path,value:after.slice(before.length),append:true}];
 }
 if(Array.isArray(before)&&Array.isArray(after)){
  if(after.length>before.length&&isDeepStrictEqual(before,after.slice(0,before.length)))return [{path,value:after.slice(before.length),append:true}];
  if(before.length===after.length)return before.flatMap((value,i)=>statePatches(value,after[i],[...path,String(i)]));
 }
 if(before&&after&&!Array.isArray(before)&&!Array.isArray(after)&&typeof before==='object'&&typeof after==='object'){
  return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key=>Object.hasOwn(after,key)?statePatches(before[key],after[key],[...path,key]):[{path:[...path,key],remove:true}]);
 }
 return [{path,value:after}];
}

export function patchState(patches){
 const values=[];let expression='payload';
 for(const patch of patches){
  values.push(patch.path);const path='$'+values.length+'::text[]';
  if(patch.remove){expression=`(${expression} #- ${path})`;continue;}
  values.push(JSON.stringify(patch.value));const value='$'+values.length+'::jsonb';
  expression=`jsonb_set(${expression},${path},${patch.append?`coalesce(payload #> ${path},'[]'::jsonb) || ${value}`:value},true)`;
 }
 return {text:`UPDATE dentec_private.app_state SET payload=${expression} WHERE id=1`,values};
}
