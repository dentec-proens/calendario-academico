import type { AssessmentSettings, ReviewEntry } from '../domain/calendar/model.ts';
import { calendarOffers, offerLabel } from '../domain/calendar/offers.ts';
import { reviewNorm } from '../domain/reviews/citation.ts';
import { reviewCriteriaFor, reviewSourceFor } from '../domain/reviews/criteria.ts';
import { rulesetVersion } from '../domain/policies/registry.ts';

const esc = (s: string | number | undefined | null) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const lines = (s: string | undefined) => esc(s).replace(/\n/g, '<br>');
const statusLabels: Record<string, string> = {
  PENDENTE: 'A avaliar',
  ATENDIDO: 'Atendido',
  NAO_ATENDIDO: 'Não atendido',
  NAO_APLICAVEL: 'Não aplicável',
};

/** A suggestion saved before assessments replaced confirmation still reads as a proposal. */
const assessmentLabel = (e: Pick<ReviewEntry, 'status' | 'reviewed'>) => {
  const label = statusLabels[e.status] || statusLabels.PENDENTE;
  if (e.status === 'PENDENTE' || e.reviewed === true) return label;
  return `${label} — proposta automática, não confirmada`;
};

export function reviewDocument(
  record: {
    state: AssessmentSettings & { year: number; campus?: string };
    courses?: string;
    seiProcess?: string;
  },
  review: {
    calendarVersion?: number;
    rulesetVersion?: string;
    entries: ReviewEntry[];
    processNumber?: string;
    applicableNorm?: string;
    reviewer: { name: string };
    revision: number;
    catalogueRevision: number;
    conclusion?: string;
  },
) {
  const reviewCriteria = reviewCriteriaFor(record.state.year),
    reviewSource = reviewSourceFor(record.state.year);
  const title = 'PARECER TÉCNICO-PEDAGÓGICO DE CALENDÁRIO ACADÊMICO E ADMINISTRATIVO';
  const metadata = [
    ['Conjunto de regras', review.rulesetVersion ?? rulesetVersion(record.state)],
    ['Processo nº', record.seiProcess || review.processNumber || 'Não informado'],
    ['Assunto', `Calendário Acadêmico e Administrativo ${record.state.year}`],
    ['Campus', record.state.campus],
    [
      'Ofertas e cursos',
      `${calendarOffers(record.state).map(offerLabel).join(' + ')} / ${record.courses}`,
    ],
    [
      'Norma do ano analisado',
      review.applicableNorm ||
        reviewNorm(record.state.year) ||
        'Não informada — conferir antes de concluir',
    ],
  ];
  const bodyRows = reviewCriteria.map((c) => {
    const e = review.entries.find((e) => e.id === c.id) || {
      status: 'PENDENTE',
      notes: '',
      reviewed: false,
    };
    return {
      criterion: [c.title, c.requirement, `Fonte: ${c.source ?? c.item}.`]
        .filter(Boolean)
        .join('\n'),
      // The item names the row, the rule is read, and the source is only consulted.
      criterionHtml: [
        `<strong>${lines(c.title)}</strong>`,
        c.requirement ? lines(c.requirement) : '',
        `<em style="color:#555;font-size:90%">Fonte: ${lines(c.source ?? c.item)}.</em>`,
      ]
        .filter(Boolean)
        .join('<br>'),
      // An observation is written only when it adds something; without one, the situation stands alone.
      assessment: [assessmentLabel(e), (e.notes ?? '').trim()].filter(Boolean).join('\n'),
      assessmentHtml: [`<strong>${esc(assessmentLabel(e))}</strong>`, lines((e.notes ?? '').trim())]
        .filter(Boolean)
        .join('<br>'),
    };
  });
  const conclusion = review.conclusion || 'Conclusão pendente de elaboração pelo parecerista.';
  const section = '1. ANÁLISE TÉCNICO-PEDAGÓGICA';
  let body = `<article><h1>PARECER</h1><h2>${title}</h2><p class="center">Pró-Reitoria de Ensino — PROENS</p>${record.state.year !== reviewSource.year ? `<p><strong>Atenção:</strong> o modelo é de ${reviewSource.year}; seus prazos e artigos não substituem a norma de ${record.state.year}.</p>` : ''}${metadata.map(([key, value]) => `<p><strong>${esc(key)}:</strong> ${esc(value)}</p>`).join('')}<h2>${section}</h2><table><thead><tr><th>Itens do calendário — roteiro do parecer</th><th>Situação e observações</th></tr></thead><tbody>${bodyRows.map((r) => `<tr><td>${r.criterionHtml}</td><td>${r.assessmentHtml}</td></tr>`).join('')}</tbody></table><h2>2. PARECER</h2><p>${esc(conclusion).replace(/\n/g, '<br>')}</p><p>Responsável pelo registro da análise: ${esc(review.reviewer.name)}.</p><p>A formalização, assinatura e tramitação são realizadas pelas instâncias competentes no SEI.</p></article>`;
  // Inline table formatting also travels with HTML clipboard content.
  body = body
    .replace('<table>', '<table style="border-collapse:collapse;width:100%;table-layout:fixed">')
    .replaceAll(
      '<td>',
      '<td style="border:1px solid #555;padding:8px;vertical-align:top;overflow-wrap:anywhere">',
    )
    .replaceAll('<th>', '<th style="border:1px solid #555;padding:8px;background:#eee">');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Parecer PROENS — minuta</title><style>@page{size:A4;margin:20mm}body{font:12pt Arial,sans-serif;color:#000;background:#fff;line-height:1.4;max-width:900px;margin:25px auto}h1,h2,.center{text-align:center}h1{font-size:14pt}h2{font-size:12pt;margin-top:24px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #555;padding:8px;vertical-align:top;overflow-wrap:anywhere}th{background:#eee}td em{color:#555;font-size:90%}tr{break-inside:avoid}thead{display:table-header-group}</style></head><body>${body}</body></html>`;
  const text = [
    'PARECER',
    title,
    'Pró-Reitoria de Ensino — PROENS',
    ...metadata.map(([key, value]) => `${key}: ${value}`),
    section,
    ...bodyRows.map((r) => r.criterion + '\n' + r.assessment),
    '2. PARECER',
    conclusion,
    `Responsável pelo registro da análise: ${review.reviewer.name}.`,
    'A formalização, assinatura e tramitação são realizadas pelas instâncias competentes no SEI.',
  ].join('\n\n');
  return { html, body, text };
}
