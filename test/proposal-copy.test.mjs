import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeFixture } from './helpers/native-database.ts';
import { proensLayout } from '../web/print.mjs';

test('campus can prepare an identified proposal before review without approving or changing its calendar', async () => {
  const { client, as, inspect } = await createNativeFixture();
  const campus = as('campus-a');
  const record = await campus.write('/api/calendars', {
    campusId: 'a',
    purpose: 'definitive',
    courses: 'Proposta sintética',
    year: 2027,
    modalities: ['graduacao'],
    regime: 'semestral',
  });
  const path = '/api/calendars/' + record.id;
  const body = { version: record.version, catalogueRevision: record.catalogueRevision };
  const before = await inspect();
  await assert.rejects(campus.actionContext(path + '/pdf', body), /Geração definitiva bloqueada/);
  await assert.rejects(
    campus.actionContext(path + '/pdf', { ...body, copy: 'true' }),
    /Geração definitiva bloqueada/,
  );
  await assert.rejects(
    as('campus-b').actionContext(path + '/pdf', { ...body, copy: true }),
    /Registro não encontrado/,
  );
  await assert.rejects(
    campus.actionContext(path + '/pdf', { ...body, copy: true, version: 0 }),
    /Salve a versão atual/,
  );
  assert.equal(await client.run((ctx) => ctx.db.query('nativeFileTickets').first()), null);
  const proposal = await campus.actionContext(path + '/pdf', { ...body, copy: true });
  assert.equal(proposal.proposalCopy, true);
  assert.equal(proposal.readiness.ready, false);
  assert.equal(proposal.readiness.officialApproval, false);
  const rendered = { ...proposal.record, proposalCopy: true, readiness: proposal.readiness };
  const html = proensLayout(rendered.state, [], null, rendered);
  assert.match(html, /CÓPIA DA PROPOSTA PARA ANÁLISE DA PROENS/);
  assert.match(html, /Sem aprovação oficial/);
  assert.deepEqual(await inspect(), before);
  const reopened = await campus.read(path);
  assert.equal(reopened.readiness.ready, false);
  assert.deepEqual(reopened.state, record.state);
  assert.equal(reopened.version, record.version);
  assert(
    !proensLayout(record.state, [], null, {
      ...record,
      purpose: 'test',
      proposalCopy: true,
    }).includes('CÓPIA DA PROPOSTA PARA ANÁLISE DA PROENS'),
  );
});
