import test from 'node:test';
import assert from 'node:assert/strict';
import { presentReviewText, reviewNorm } from '../src/review-presentation.mjs';
import { reviewSupport, initialConclusion } from '../src/review.mjs';
import { reviewDocument } from '../src/review-export.mjs';
import {
  partialConclusion,
  favorableConclusion,
  updateConclusion,
} from '../src/review-conclusion.mjs';

const norm2027 = { norm: 'Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026' };

const record = {
  id: 'fixture',
  name: 'Calendário 2027 - Campus Pinhais',
  version: 27,
  courses: 'Curso de teste',
  state: {
    year: 2027,
    campus: 'Pinhais',
    offer: 'integrado',
    regime: 'anual',
    weekdays: [],
    weekConfirmed: false,
    periods: [],
    events: [],
  },
};
const oldIntroduction =
  'A análise inicial do Calendário Acadêmico e Administrativo 2027, campus Pinhais, versão 27, foi organizada conforme critérios institucionais.';

test('initial review identifies the approved resolution without disclosing the calendar version in its prose', () => {
  const support = reviewSupport(record, []),
    text = initialConclusion(support);
  assert(text.includes(norm2027.norm));
  assert(!/versão 27/i.test(text));
  assert.equal(support.calendar.version, 27);
});

test('legacy text correction preserves human prose and historical fields', () => {
  const human = 'Observação: o campus revisou a versão 27 em reunião.';
  const text = oldIntroduction + '\n\n' + human + '\n\n' + partialConclusion;
  const corrected = presentReviewText(text, 2027);
  assert(
    corrected.startsWith(
      'A análise inicial do Calendário Acadêmico e Administrativo 2027, campus Pinhais, foi organizada conforme critérios institucionais.',
    ),
  );
  assert(corrected.includes(human));
  assert(corrected.includes(norm2027.norm));
  assert(!corrected.includes('XXX/2026'));
  assert.equal(presentReviewText(corrected, 2027), corrected);
  assert.equal(presentReviewText(partialConclusion, 2028), partialConclusion);
  assert.equal(reviewNorm(2026, 'Resolução de 2026'), 'Resolução de 2026');
});

test('both conclusion decisions use the approved reference without duplicated paragraphs', () => {
  const criteria = [{ id: 'a' }];
  for (const [status, standard] of [
    ['ATENDIDO', favorableConclusion],
    ['NAO_ATENDIDO', partialConclusion],
  ]) {
    const entries = [{ id: 'a', status, reviewed: true }];
    const text = updateConclusion(
      presentReviewText(oldIntroduction + '\n\n' + standard, 2027),
      criteria,
      entries,
      reviewNorm(2027),
    );
    assert(text.includes(norm2027.norm));
    assert(!text.includes('XXX'));
    assert.equal((text.match(/Calendário Acadêmico e Administrativo proposto/g) || []).length, 1);
  }
});

test('HTML and text exports remove generated calendar version labels without rewriting saved review history', () => {
  const review = {
    entries: reviewSupport(record, []).criteria.map((c) => c.initial),
    reviewer: { name: 'Parecerista' },
    revision: 4,
    calendarVersion: 27,
    catalogueRevision: 3,
    applicableNorm: 'Resolução Consup/IFPR nº XXX/2026',
    conclusion: oldIntroduction + '\n\n' + partialConclusion,
    history: [{ conclusion: 'Texto original preservado.' }],
  };
  const before = structuredClone(review),
    doc = reviewDocument(record, review);
  for (const text of [doc.html, doc.body, doc.text]) {
    assert(text.includes(norm2027.norm));
    assert(!text.includes('XXX/2026'));
    assert(!/calendário versão|CALENDÁRIO VERSÃO|campus Pinhais, versão 27/.test(text));
  }
  assert.deepEqual(review, before);
  assert.equal(review.calendarVersion, 27);
});
