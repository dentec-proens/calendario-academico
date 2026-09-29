import {randomUUID} from 'node:crypto';
const key=name=>String(name).trim().toLocaleLowerCase('pt-BR');
export function updateCampuses(db){
 for(const name of ['Ponta Grossa','Toledo'])if(!db.campuses.some(c=>key(c.name)===key(name)))db.campuses.push({id:randomUUID(),name});
 for(const campus of db.campuses)if(key(campus.name)==='reitoria')campus.archived=true;
}
export function selectableCampuses(campuses){
 return campuses.filter(c=>!c.archived&&key(c.name)!=='reitoria').sort((a,b)=>a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'}));
}
