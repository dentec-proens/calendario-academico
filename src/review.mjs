import {calendarModalities} from './modalities.mjs';
import {calendarResult} from './pdf.mjs';
export const reviewSource={id:'SEI 3959640',year:2026,title:'Parecer técnico-pedagógico de calendário acadêmico e administrativo',norm:'Resolução Consup/IFPR 259, de 27/11/2025'};
const rows=[
 ['annual','Mínimo de 200 dias letivos anuais e carga horária do PPC',1,'Análise técnico-pedagógica',null],
 ['semester','100 dias por semestre para oferta semestral',1,'Análise técnico-pedagógica',null],
 ['institution','Atividades acadêmicas e administrativas previstas na norma',1,'Art. 2º','institucional'],
 ['window','Janela do ano letivo: 04/02 a 18/12/2026; início até 28/02/2026',1,'Análise técnico-pedagógica',null],
 ['minutes','Extratos das atas de aprovação pelo CGPC e Codic',1,'Instrução processual','cgpc|codic|ata'],
 ['I','Início e término de cada período: bimestre/trimestre, semestre e ano',1,'Art. 7º, I',null],
 ['II','Feriados e recessos acadêmicos e administrativos',1,'Art. 7º, II','feriado|recesso'],
 ['III','Períodos de férias escolares',1,'Art. 7º, III','ferias'],
 ['IV','Férias docentes: 45 dias, preferencialmente coincidentes com férias escolares',1,'Art. 7º, IV','ferias.*docent|docent.*ferias'],
 ['V','Matrícula e ajustes de veteranos dos cursos subsequentes e de graduação',1,'Art. 7º, V','matricula'],
 ['VI','Aproveitamento de estudos, certificação de conhecimentos e equivalência de estágio: uma vez no anual; duas no semestral',1,'Art. 7º, VI','aproveitamento|certificacao|equivalencia'],
 ['VII','Trancamento de curso e cancelamento de componente: subsequentes e graduação',1,'Art. 7º, VII','trancamento|cancelamento'],
 ['VIII','Editais de transferência, reingresso e portadores de diploma antes do período: uma vez no anual; duas no semestral',2,'Art. 7º, VIII','transferencia|reingresso|diploma'],
 ['IX','Lançamento dos resultados e frequência de cada etapa',2,'Art. 7º, IX','resultado|rendimento|frequencia'],
 ['X','Lançamento dos resultados finais e frequência',2,'Art. 7º, X','resultado.*fina|fina.*resultado'],
 ['XI','Fechamento e entrega dos diários de classe',2,'Art. 7º, XI','diario'],
 ['XII','Submissão do PIT e do Plano de Ensino à direção',2,'Art. 7º, XII','\\bpit\\b|plano.*ensino|plano individual'],
 ['XIII','Conselhos/coletivos e reuniões pedagógicas após resultados parciais',2,'Art. 7º, XIII','conselho|coletivo|reuniao pedagogica'],
 ['XIV','Prazo para estudantes solicitarem revisão de resultados finais',2,'Art. 7º, XIV','revisao.*resultado'],
 ['XV','Conselhos/coletivos extraordinários para revisão de resultados',2,'Art. 7º, XV','extraordinario'],
 ['XVI','Reuniões com familiares, responsáveis e comunidade',2,'Art. 7º, XVI','familia|responsave|comunidade'],
 ['XVII','Eventos de ensino, pesquisa, extensão e inovação do campus',2,'Art. 7º, XVII','ensino|pesquisa|extensao|inovacao'],
 ['XVIII','Encontro dos egressos',2,'Art. 7º, XVIII','egresso'],
 ['XIX','Evento sobre estágios',2,'Art. 7º, XIX','estagio'],
 ['XX','Fase local da Olimpíada Brasileira de Robótica até 31/08/2026',2,'Art. 7º, XX','robotica|\\bobr\\b'],
 ['XXI','Mostra de Cursos até 30/09/2026',2,'Art. 7º, XXI','mostra.*curso'],
 ['XXII','Formação pedagógica: mínimo de 40 horas anuais',2,'Art. 7º, XXII','formacao'],
 ['XXIII','Planejamento/replanejamento coletivo: mínimo de 20 horas anuais',2,'Art. 7º, XXIII','planejamento'],
 ['XXIV','Semana de Valorização de Mulheres que Fizeram História em março: obrigatória nos técnicos e facultativa na graduação',2,'Art. 7º, XXIV','mulher'],
 ['XXV','Semana Cultural Interescolar em outubro: obrigatória nos técnicos e facultativa na graduação',2,'Art. 7º, XXV','cultural|interescolar']
];
const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const reviewCriteria=rows.map(([id,title,page,item,pattern])=>({id,title,page,item,pattern}));
export function reviewSupport(record,events){
 let result=null,error=null;try{result=calendarResult(record.state,events);}catch{error='Contagem indisponível: confira semana letiva, períodos e evidências no editor.';}
 const sameYear=record.state.year===reviewSource.year;
 return {source:reviewSource,sameYear,officialApproval:false,calendar:{id:record.id,name:record.name,campus:record.state.campus,year:record.state.year,offer:record.state.offer,modalities:calendarModalities(record.state),regime:record.state.regime,version:record.version},criteria:reviewCriteria.map(c=>{
  let signal='Conferência documental necessária.',candidates=[];
  if(c.pattern){const pattern=new RegExp(c.pattern);candidates=events.filter(e=>pattern.test(normalize(e.name+' '+(e.category||'')))).map(e=>({id:e.id,name:e.name,start:e.start,end:e.end,evidence:e.evidence}));signal=candidates.length?`${candidates.length} registro(s) possivelmente relacionado(s). A presença não comprova atendimento.`:'Nenhum registro localizado por nome/categoria. Isso não comprova ausência no processo.';}
  if(c.id==='annual')signal=result?`${result.total} dias calculados; ${result.total>=200?'alcança':'não alcança'} a referência de 200 do parecer. Carga horária do PPC exige análise.`:error;
  if(c.id==='semester')signal=record.state.regime==='anual'?'Oferta registrada como anual. Confira a aplicabilidade.':result?record.state.periods.map(p=>`${p.name}: ${result.byPeriod[p.id]} dias`).join('; ')+' — confira 100 dias em cada semestre.':error;
  if(c.id==='I')signal=record.state.periods.map(p=>`${p.name}: ${p.start} a ${p.end}`).join('; ')||'Nenhum período cadastrado. Confira também as etapas internas.';
  if(c.id==='window'){
   const starts=record.state.periods.map(p=>p.start).sort(),ends=record.state.periods.map(p=>p.end).sort();
   signal=!sameYear?'Datas de 2026 não aplicadas. Consulte a resolução do ano do calendário.':!starts.length?'Nenhum período cadastrado.':`${starts[0]} a ${ends.at(-1)}. ${starts[0]>='2026-02-04'&&starts[0]<='2026-02-28'&&ends.at(-1)<='2026-12-18'?'Dentro da janela indicada no parecer.':'Fora da janela indicada no parecer; revisar.'}`;
  }
  if(['V','VII'].includes(c.id)&&calendarModalities(record.state).every(m=>m==='integrado'))signal+=' O texto do parecer menciona subsequentes e graduação: confira se não se aplica.';
  if(['XXIV','XXV'].includes(c.id)&&calendarModalities(record.state).every(m=>m==='graduacao'))signal+=' O parecer de 2026 considera esse evento facultativo para graduação.';
  if(['IV','XXII','XXIII'].includes(c.id))signal+=' A quantidade de dias/horas não está comprovada pela identificação do evento.';
  if(!sameYear)signal+=' Critério extraído de parecer de 2026; confirme a exigência na norma vigente.';
  let status='PENDENTE',finding=candidates.length?'REGISTROS_LOCALIZADOS':'CONFERENCIA_NECESSARIA';
  if(c.pattern&&!candidates.length)finding='NAO_LOCALIZADO';
  if(c.id==='annual'&&result){finding=result.total<200?'CONTAGEM_INSUFICIENTE':'CONTAGEM_ALCANCADA';if(sameYear&&result.total<200)status='NAO_ATENDIDO';}
  if(c.id==='semester'&&record.state.regime==='anual'){finding='APLICABILIDADE';if(sameYear)status='NAO_APLICAVEL';}
  if(c.id==='semester'&&record.state.regime!=='anual'&&result){const valid=record.state.periods.length===2&&record.state.periods.every(p=>result.byPeriod[p.id]>=100);finding=valid?'CONTAGEM_ALCANCADA':'CONTAGEM_INSUFICIENTE';if(sameYear)status=valid?'ATENDIDO':'NAO_ATENDIDO';}
  if(c.id==='window'&&sameYear&&record.state.periods.length){const starts=record.state.periods.map(p=>p.start).sort(),ends=record.state.periods.map(p=>p.end).sort();status=starts[0]>='2026-02-04'&&starts[0]<='2026-02-28'&&ends.at(-1)<='2026-12-18'?'ATENDIDO':'NAO_ATENDIDO';finding='DATAS_COMPARADAS';}
  const notes=(signal+(candidates.length?' Registros: '+candidates.slice(0,3).map(e=>`${e.name} (${e.start} a ${e.end}); fonte: ${e.evidence||'não informada'}`).join(' | '):'')).slice(0,1950);
  return {...c,signal,candidates,initial:{id:c.id,status,notes,reviewed:false,finding}};
 }),conflicts:result?.conflicts||[],countError:error};
}
export const reviewStatuses=['PENDENTE','ATENDIDO','NAO_ATENDIDO','NAO_APLICAVEL'];
export function initialConclusion(support){
 const missing=support.criteria.filter(c=>c.initial.finding==='NAO_LOCALIZADO').length;
 return `A análise inicial do Calendário Acadêmico e Administrativo ${support.calendar.year}, campus ${support.calendar.campus}, versão ${support.calendar.version}, foi organizada conforme o roteiro do Parecer SEI 3959640. Foram examinados ${support.criteria.length} critérios com os dados cadastrados. ${missing} critério(s) não tiveram registros localizados pela busca de nomes/categorias e necessitam conferência documental. ${support.countError||'A contagem e os conflitos identificados estão registrados na análise técnica.'} ${support.sameYear?'':'O modelo de referência é de 2026: é necessário confrontar seus critérios com a norma do ano analisado. '}Esta é uma minuta de apoio, sujeita à revisão e à conclusão do parecerista. Não constitui aprovação oficial.`;
}
