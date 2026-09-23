export const modalityLabels={integrado:'Técnico integrado',subsequente:'Técnico subsequente',graduacao:'Graduação',posgraduacao:'Pós-graduação',tecnico:'Cursos técnicos (registro anterior)'};
export const selectableModalities=['integrado','subsequente','graduacao','posgraduacao'];
export const calendarModalities=state=>state.modalities?.length?state.modalities:[state.offer];
export function appliesTo(event,modality){
 const scope=event.modalities?.length?event.modalities:event.offers;
 if(!scope?.length)return true;
 return scope.includes(modality)||(modality==='tecnico'&&scope.some(m=>['integrado','subsequente'].includes(m)))||(['integrado','subsequente'].includes(modality)&&scope.includes('tecnico'));
}
