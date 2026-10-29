import { test } from 'vitest';
import assert from 'node:assert/strict';
import { api, internal } from '../../convex/_generated/api.js';
import { createNativeFixture } from '../helpers/native-database.ts';
import { reviewCriteriaFor } from '../../src/domain/reviews/criteria.ts';
import { portalPermissions } from '../../web/portal/permissions.ts';

async function fixture() {
  const f = await createNativeFixture();
  await f.client.run((ctx) =>
    ctx.db.patch(f.ids.users['campus-b'], { role: 'PARECERISTA', campusId: undefined }),
  );
  return {
    ...f,
    reviewer: f.asClient('campus-b'),
    admin: f.asClient('admin'),
    campus: f.asClient('campus-a'),
  };
}

test('reviewer reads across campuses and issues reviews but cannot modify calendars or accounts', async () => {
  const { client, reviewer, admin, campus, ids } = await fixture();
  const record = await campus.mutation(api.calendars.createCalendar, {
    body: {
      campusId: ids.campuses.a,
      year: 2027,
      modalities: ['integrado'],
      regime: 'anual',
      courses: 'Curso de teste',
      classes: '',
      shifts: '',
      purpose: 'test',
    },
  });
  const bootstrap = await reviewer.query(api.workspace.bootstrap, {});
  assert.equal(bootstrap.campuses.length, 2);
  assert.equal(bootstrap.users.length, 0);
  assert.equal((await reviewer.query(api.calendars.calendar, { id: record.id })).id, record.id);
  const support = await reviewer.query(api.reviews.review, { id: record.id });
  const body = {
    rulesetVersion: support.rulesetVersion,
    baseIdentity: support.baseIdentity,
    revision: 0,
    calendarVersion: record.version,
    catalogueRevision: support.catalogueRevision,
    conclusion: support.initialConclusion,
    entries: reviewCriteriaFor(2027).map((c) => ({
      id: c.id,
      status: 'PENDENTE' as const,
      notes: '',
      reviewed: false,
    })),
  };
  assert.equal(
    (await reviewer.mutation(api.reviews.saveReview, { id: record.id, body })).revision,
    1,
  );
  assert.match(
    (await reviewer.query(api.reviews.exportReview, { id: record.id, revision: 1 })).text,
    /minuta/i,
  );
  await assert.rejects(campus.query(api.reviews.review, { id: record.id }), /Acesso exclusivo/);
  await assert.rejects(
    reviewer.mutation(api.calendars.createCalendar, {
      body: {
        campusId: ids.campuses.b,
        year: 2027,
        modalities: ['integrado'],
        regime: 'anual',
        courses: 'Teste',
        classes: '',
        shifts: '',
        purpose: 'test',
      },
    }),
    /não podem alterar/,
  );
  await assert.rejects(
    reviewer.mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: {
        state: record.state,
        version: record.version,
        catalogueRevision: record.currentCatalogueRevision,
      },
    }),
    /não podem alterar/,
  );
  await assert.rejects(
    reviewer.mutation(api.calendars.deleteCalendar, { id: record.id, version: record.version }),
    /não podem alterar/,
  );
  await assert.rejects(
    reviewer.mutation(api.calendars.restoreCalendar, { id: record.id }),
    /não podem alterar/,
  );
  await assert.rejects(
    reviewer.mutation(api.calendars.makeDefinitive, { id: record.id, version: record.version }),
    /não podem alterar/,
  );
  await assert.rejects(
    reviewer.mutation(api.campuses.createCampus, { name: 'Outra' }),
    /Acesso exclusivo/,
  );
  await assert.rejects(
    reviewer.mutation(api.access.members.updateMemberRole, {
      expected: { role: 'CAMPUS', campusId: ids.campuses.a },
      id: ids.users['campus-a'],
      role: 'ADMIN',
    }),
    /Acesso exclusivo/,
  );
  await assert.rejects(
    reviewer.mutation(api.nativeFiles.issueUpload, { filename: 'teste.pdf', size: 10 }),
    /Acesso exclusivo da administração/,
  );
  await assert.rejects(
    reviewer.query(api.workspace.logs, { paginationOpts: { cursor: null, numItems: 10 } }),
    /não podem alterar/,
  );
  await assert.rejects(
    campus.mutation(api.access.members.updateMemberRole, {
      expected: { role: 'CAMPUS', campusId: ids.campuses.a },
      id: ids.users['campus-a'],
      role: 'ADMIN',
    }),
    /Acesso exclusivo/,
  );
  assert.equal((await admin.query(api.reviews.review, { id: record.id })).review?.revision, 1);
  assert.equal((await client.run((ctx) => ctx.db.get(record.id)))?.version, record.version);
});

test('profile updates preserve credentials, audit changes and revoke prior sessions', async () => {
  const { client, admin, campus, ids } = await fixture();
  await client.run((ctx) =>
    ctx.db.insert('authAccounts', {
      userId: ids.users['campus-a'],
      provider: 'password',
      providerAccountId: 'a@ifpr.edu.br',
      secret: 'synthetic-preserved-hash',
    }),
  );
  await admin.mutation(api.access.members.updateMemberRole, {
    expected: { role: 'CAMPUS', campusId: ids.campuses.a },
    id: ids.users['campus-a'],
    role: 'PARECERISTA',
  });
  const row = await client.run((ctx) => ctx.db.get(ids.users['campus-a']));
  assert.equal(row?.role, 'PARECERISTA');
  assert.equal(row?.campusId, undefined);
  assert.equal(
    (await client.run((ctx) => ctx.db.query('authAccounts').first()))?.secret,
    'synthetic-preserved-hash',
  );
  await assert.rejects(campus.query(api.workspace.bootstrap, {}), /Entre com sua conta/);
  assert.equal(
    (await client.run((ctx) => ctx.db.query('audit').first()))?.action,
    'UPDATE_MEMBER_ROLE',
  );
  await assert.rejects(
    admin.mutation(api.access.members.updateMemberRole, {
      expected: { role: 'PARECERISTA', campusId: null },
      id: ids.users['campus-a'],
      role: 'CAMPUS',
    }),
    /campus ativo/,
  );
  await admin.mutation(api.access.members.updateMemberRole, {
    expected: { role: 'PARECERISTA', campusId: null },
    id: ids.users['campus-a'],
    role: 'CAMPUS',
    campusId: ids.campuses.b,
  });
  assert.equal(
    (await client.run((ctx) => ctx.db.get(ids.users['campus-a'])))?.campusId,
    ids.campuses.b,
  );
});

test('last active administrator cannot lose the ADMIN profile', async () => {
  const { admin, ids } = await fixture();
  await assert.rejects(
    admin.mutation(api.access.members.updateMemberRole, {
      expected: { role: 'ADMIN', campusId: null },
      id: ids.users.admin,
      role: 'PARECERISTA',
    }),
    /manter um administrador ativo/,
  );
  await admin.mutation(api.access.members.updateMemberRole, {
    expected: { role: 'CAMPUS', campusId: ids.campuses.a },
    id: ids.users['campus-a'],
    role: 'ADMIN',
  });
  await admin.mutation(api.access.members.updateMemberRole, {
    expected: { role: 'ADMIN', campusId: null },
    id: ids.users.admin,
    role: 'PARECERISTA',
  });
  await assert.rejects(admin.query(api.workspace.bootstrap, {}), /Entre com sua conta/);
});

test('new reviewers have institutional scope without a campus', async () => {
  const { admin } = await fixture();
  const member = await admin.mutation(internal.access.members.createMemberRecord, {
    data: {
      name: 'Parecerista',
      email: 'parecer@ifpr.edu.br',
      role: 'PARECERISTA',
      loginMethod: 'local',
    },
    secret: 'synthetic',
  });
  assert.equal(member.role, 'PARECERISTA');
  assert.equal(member.campusId, null);
});

test('portal capabilities separate reviewing, calendar editing and account administration', () => {
  assert.equal(portalPermissions('PARECERISTA').reviewCalendars, true);
  assert.equal(portalPermissions('PARECERISTA').editCalendars, false);
  assert.equal(portalPermissions('PARECERISTA').manageAccounts, false);
  assert.equal(portalPermissions('CAMPUS').reviewCalendars, false);
  assert.equal(portalPermissions('CAMPUS').selectCampus, false);
  assert.equal(portalPermissions('CAMPUS').editCalendars, true);
  assert.equal(portalPermissions('ADMIN').manageAccounts, true);
});

test('campus cannot read or change another campus while admin can manage both', async () => {
  const { admin, campus, ids } = await fixture();
  const body = {
    campusId: ids.campuses.b,
    year: 2027,
    modalities: ['integrado' as const],
    regime: 'anual' as const,
    courses: 'Teste isolado',
    purpose: 'test' as const,
  };
  const other = await admin.mutation(api.calendars.createCalendar, { body });
  await assert.rejects(
    campus.mutation(api.calendars.createCalendar, { body }),
    /Registro não encontrado/,
  );
  await assert.rejects(
    campus.query(api.calendars.calendar, { id: other.id }),
    /Registro não encontrado/,
  );
  await assert.rejects(
    campus.query(api.calendars.calendarPage, {
      campusId: ids.campuses.b,
      paginationOpts: { numItems: 10, cursor: null },
    }),
    /Registro não encontrado/,
  );
  await assert.rejects(
    campus.mutation(api.calendars.saveCalendar, {
      id: other.id,
      body: {
        version: other.version,
        catalogueRevision: other.currentCatalogueRevision,
        state: other.state,
      },
    }),
    /Registro não encontrado/,
  );
  await assert.rejects(
    campus.mutation(api.calendars.deleteCalendar, { id: other.id, version: other.version }),
    /Registro não encontrado/,
  );
  await assert.rejects(
    campus.mutation(api.access.members.removeMember, { id: ids.users['campus-b'] }),
    /Acesso exclusivo/,
  );
  await assert.rejects(
    campus.mutation(api.campuses.createCampus, { name: 'Proibido' }),
    /Acesso exclusivo/,
  );
  await admin.mutation(api.calendars.deleteCalendar, { id: other.id, version: other.version });
  await assert.rejects(
    campus.mutation(api.calendars.restoreCalendar, { id: other.id }),
    /Registro não encontrado/,
  );
  await admin.mutation(api.calendars.restoreCalendar, { id: other.id });
  assert.equal((await admin.query(api.calendars.calendar, { id: other.id })).id, other.id);
});

test('concurrent profile edits compare the original role and campus atomically', async () => {
  const { client, admin, ids } = await fixture();
  const expected = { role: 'CAMPUS' as const, campusId: ids.campuses.a };
  await admin.mutation(api.access.members.updateMemberRole, {
    id: ids.users['campus-a'],
    expected,
    role: 'CAMPUS',
    campusId: ids.campuses.b,
  });
  const afterFirst = await client.run((ctx) => ctx.db.get(ids.users['campus-a']));
  await assert.rejects(
    admin.mutation(api.access.members.updateMemberRole, {
      id: ids.users['campus-a'],
      expected,
      role: 'PARECERISTA',
      campusId: null,
    }),
    /perfil mudou em outra sessão/,
  );
  assert.deepEqual(await client.run((ctx) => ctx.db.get(ids.users['campus-a'])), afterFirst);
  await admin.mutation(api.access.members.updateMemberRole, {
    id: ids.users['campus-a'],
    expected: { role: 'CAMPUS', campusId: ids.campuses.b },
    role: 'PARECERISTA',
    campusId: null,
  });
  await assert.rejects(
    admin.mutation(api.access.members.updateMemberRole, {
      id: ids.users['campus-a'],
      expected: { role: 'CAMPUS', campusId: ids.campuses.b },
      role: 'ADMIN',
      campusId: null,
    }),
    /perfil mudou em outra sessão/,
  );
  assert.equal((await client.run((ctx) => ctx.db.get(ids.users['campus-a'])))?.role, 'PARECERISTA');
});
