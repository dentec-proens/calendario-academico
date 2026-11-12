import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createNativeFixture } from '../helpers/native-database.ts';
import { submittableState } from '../helpers/required-vacations.ts';
import { proensLayout } from '../../src/printing/calendar-layout.ts';

test('a submitted calendar prints as under PROENS analysis without approving or changing it', async () => {
  const { as, inspect } = await createNativeFixture();
  const campus = as('campus-a');
  const record = await campus.write('/api/calendars', {
    campusId: 'a',
    courses: 'Proposta sintética',
    year: 2027,
    offers: [{ kind: 'graduacao', organization: 'semestral' }],
  });
  const path = '/api/calendars/' + record.id;
  assert.match(proensLayout(record.state, [], null, record), /Rascunho — sem validade/);
  await campus.write(path + '/transition', { action: 'submit' });
  const before = await inspect();
  const reopened = await campus.read(path);
  assert.equal(reopened.status, 'enviado');
  assert.equal(reopened.readiness.ready, false);
  assert.equal(reopened.readiness.officialApproval, false);
  const html = proensLayout(reopened.state, [], null, reopened);
  assert.match(html, /Em análise na PROENS — sem validade/);
  assert.doesNotMatch(html, /Sem aprovação oficial/);
  assert.deepEqual(await inspect(), before, 'printing never writes');
  assert.deepEqual(reopened.state, submittableState(record.state));
  assert.equal(reopened.version, record.version);
});
