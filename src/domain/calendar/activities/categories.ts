// Colors sampled from the supplied PROENS 2026 graphical legend.
export const categories: [string, string, string | null][] = [
  ['limite', 'Início e término de período letivo', '#ffff00'],
  ['feriado', 'Feriado', '#ff0000'],
  ['recesso', 'Recesso acadêmico e administrativo', '#fabf8f'],
  ['ferias', 'Férias escolares', '#efefef'],
  ['sabado', 'Sábados letivos', '#c3e184'],
  ['comemorativo', 'Datas comemorativas', '#ffd9ff'],
  ['evento', 'Eventos artísticos, científicos, culturais, esportivos e tecnológicos', '#c0f2ff'],
  ['formacao', 'Formação pedagógica', '#00ff00'],
  ['conselho', 'Conselhos de classe', '#ff00ff'],
  ['criacao', 'Dia de criação do IFPR e da Rede Federal de EPT', '#70ad47'],
  ['institucional', 'Outro evento institucional (sem cor específica)', null],
  ['prazo', 'Prazo (sem cor específica)', null],
];
export const validCategory = (value: unknown) => categories.some(([key]) => key === value);

export function eventCategory(e: { category?: string; id?: string; name?: string; kind?: string }) {
  if (e.category && validCategory(e.category)) return e.category;
  return e.kind === 'include' ? 'sabado' : e.kind === 'exclude' ? 'recesso' : 'institucional';
}

export const categoryLabel = (e: Parameters<typeof eventCategory>[0]) =>
  categories.find(([key]) => key === eventCategory(e))![1];
