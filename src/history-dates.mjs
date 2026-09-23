const months=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
export function monthHeading(line){const match=line.trim().toLowerCase().match(/^(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s*[-/–]?\s*\d{4})?$/);return match?months.indexOf(match[1])+1:null;}
export function extractHistoricalDates(line,month){
 if(/^\s*\d+\s+dias?\s+letivos?/i.test(line))return null;
 // A leading day can be only the endpoint of an interval described later in the text.
 if(/\([^)]*\d{1,2}\/\d{1,2}\/\d{4}/.test(line))return null;
 const m=line.match(/^\s*(\d{1,2})(?:[/.](\d{1,2})(?:[/.](\d{4}))?)?(?:\s*(?:a|até|–|-)\s*(\d{1,2})(?:[/.](\d{1,2})(?:[/.](\d{4}))?)?)?\s*[-–:]?\s+(.+)$/i);
 if(!m)return null;
 const startMonth=Number(m[2]||m[5]||month),endMonth=Number(m[5]||startMonth),startDay=Number(m[1]),endDay=Number(m[4]||m[1]);
 // Numeric calendar grids, lists of dates and absent month context must not become events.
 if(!startMonth||!/[A-Za-zÀ-ÿ]{3}/.test(m[7])||/^(?:e\s+\d|\d)/i.test(m[7]))return null;
 if(startDay<1||endDay<1||startDay>31||endDay>31||startMonth>12||endMonth>12)return null;
 return {startMonth,startDay,endMonth,endDay,name:m[7],sourceYear:m[3]?Number(m[3]):null,endYear:m[6]?Number(m[6]):null};
}
export function proposedDates(candidate,year){
 const d=candidate.dates;if(!d)return {start:'',end:'',warning:'Data não reconhecida com segurança. Preencha após consultar o PDF.'};
 if(/carnaval|p[aá]scoa|corpus christi|sexta.feira santa|paix[aã]o de cristo|cinzas/i.test(candidate.name))return {start:'',end:'',warning:'Data móvel: confirme no calendário do ano atual.'};
 if(/s[aá]bado.*letivo/i.test(candidate.name))return {start:'',end:'',warning:'Sábado letivo: escolha o sábado correspondente no ano atual.'};
 const civil=(month,day)=>{const value=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;const parsed=new Date(value+'T12:00:00Z');return Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===value?value:'';};
 const start=civil(d.startMonth,d.startDay),end=civil(d.endMonth,d.endDay);
 if(!start||!end||end<start)return {start:'',end:'',warning:'Intervalo incompatível com o ano atual. Informe as datas corretas.'};
 return {start,end,warning:'Mesmo dia e mês do ano anterior: confirme a vigência e os dias da semana.'};
}
