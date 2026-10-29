import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createNativeFixture } from '../helpers/native-database.ts';
import { proensLayout } from '../../src/printing/calendar-layout.ts';

test('an unready definitive calendar prints as an identified proposal without approving or changing it', async () => {
  const { as, inspect } = await createNativeFixture();
  const campus = as('campus-a');
  const record = await campus.write('/api/calendars', {
    campusId: 'a',
    purpose: 'definitive',
    courses: 'Proposta sintética',
    year: 2027,
    offers: [{ kind: 'graduacao', organization: 'semestral' }],
  });
  const path = '/api/calendars/' + record.id;
  const before = await inspect();
  const reopened = await campus.read(path);
  assert.equal(reopened.readiness.ready, false);
  assert.equal(reopened.readiness.officialApproval, false);
  const html = proensLayout(reopened.state, [], null, reopened);
  assert.match(html, /CÓPIA DA PROPOSTA PARA ANÁLISE DA PROENS/);
  assert.match(html, /Sem aprovação oficial/);
  assert.deepEqual(await inspect(), before);
  assert.deepEqual(reopened.state, record.state);
  assert.equal(reopened.version, record.version);
  assert(
    !proensLayout(record.state, [], null, { ...record, purpose: 'test' }).includes(
      'CÓPIA DA PROPOSTA PARA ANÁLISE DA PROENS',
    ),
  );
});
