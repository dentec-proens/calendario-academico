export const historyCandidateKey=c=>JSON.stringify([c.page,c.excerpt]);
export function includedHistoryCandidate(events,historyId,candidate,candidates){
 const key=historyCandidateKey(candidate);
 return events.some(e=>{
  const source=e.historicalSource;if(!source||source.historyId!==historyId||source.page!==candidate.page)return false;
  if(source.candidateKey)return source.candidateKey===key;
  // Legacy records can only be matched when their original name is unambiguous.
  return e.name===candidate.name&&candidates.filter(c=>c.page===candidate.page&&c.name===candidate.name).length===1;
 });
}
