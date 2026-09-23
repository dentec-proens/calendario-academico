import test from 'node:test';
import assert from 'node:assert/strict';
import {extractHistoricalDates,proposedDates} from '../src/history-dates.mjs';
import {suggestionsFromPages} from '../src/history-analysis.mjs';
test('extracts full dates, ranges and month headings beyond the old keyword filter',()=>{
 const analysis=suggestionsFromPages([{page:1,text:'JANEIRO 2026\n02 a 31 Férias docentes\nFEVEREIRO\n05 Início das aulas\n10/03/2026 a 12/03/2026 - Entrega dos diários\n15/04 - Submissão do PIT'}]);
 assert.equal(analysis.version,2);assert.equal(analysis.candidates.length,4);
 assert.deepEqual(proposedDates(analysis.candidates[0],2027),{start:'2027-01-02',end:'2027-01-31',warning:'Mesmo dia e mês do ano anterior: confirme a vigência e os dias da semana.'});
 assert.equal(proposedDates(analysis.candidates[1],2027).start,'2027-02-05');assert.equal(proposedDates(analysis.candidates[2],2027).end,'2027-03-12');
 assert.equal(extractHistoricalDates('01 a 15/07 - Férias docentes').startMonth,7);
});
test('does not infer movable holidays, impossible dates, grids or ambiguous date lists',()=>{
 const candidate=(line)=>({name:line,dates:extractHistoricalDates(line)});
 assert.equal(proposedDates(candidate('29/02/2024 - Evento'),2027).start,'');
 assert.equal(proposedDates(candidate('03/03 - Carnaval'),2027).start,'');
 assert.equal(proposedDates(candidate('31/04 - Evento'),2027).start,'');
 assert.equal(extractHistoricalDates('04 05 06 07 08 09 10',2),null);
 assert.equal(extractHistoricalDates('01 e 03/05 - Evento'),null);
 assert.equal(extractHistoricalDates('15 - Entrega do PIT'),null);
 const parsed=suggestionsFromPages([{page:1,text:'JANEIRO\n05 Início das aulas'},{page:2,text:'05 Início das aulas'}]);assert.equal(parsed.candidates.length,1);
});
