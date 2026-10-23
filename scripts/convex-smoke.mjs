import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { convexRuntimeConfiguration } from '../src/convex-config.mjs';
import { openConvexStore } from '../src/convex-store.mjs';

const root = new URL('../', import.meta.url),
  configurationPath = new URL('.env.convex.local', root),
  loginPath = new URL('.env.convex.test-login', root),
  reportPath = new URL('docs/evidencias-convex/smoke.json', root),
  base = 'http://127.0.0.1:4183',
  labEmail = 'convex-lab-admin@ifpr.edu.br',
  started = new Date().toISOString(),
  report = { started, app: base, syntheticData: true, checks: [], passed: false },
  sensitive = [];
let cookie = '',
  activeStage = 'deployment-guard';

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function check(name, operation) {
  activeStage = name;
  const beginning = performance.now(),
    details = await operation();
  report.checks.push({
    name,
    passed: true,
    durationMs: Math.round(performance.now() - beginning),
    ...details,
  });
  console.log('PASS', name);
  return details;
}

async function call(path, { method = 'GET', body, authenticated = true, binary = false } = {}) {
  assert.ok(path.startsWith('/api/'), 'Only same-origin application APIs are allowed.');
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Dentec-Request': '1',
      ...(authenticated && cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
    redirect: 'error',
  });
  return {
    status: response.status,
    cookie: response.headers.get('set-cookie')?.split(';')[0],
    type: response.headers.get('content-type'),
    disposition: response.headers.get('content-disposition'),
    data: binary ? Buffer.from(await response.arrayBuffer()) : await response.json(),
  };
}

function expect(response, status, label) {
  assert.equal(
    response.status,
    status,
    `${label}: expected HTTP ${status}, received ${response.status}.`,
  );
  return response.data;
}

function payload(calendar, state = calendar.state) {
  return {
    version: calendar.version,
    catalogueRevision: calendar.currentCatalogueRevision || calendar.catalogueRevision,
    state,
  };
}

function syntheticEvent(id, name) {
  return {
    id,
    name,
    start: '2027-03-01',
    end: '2027-03-01',
    kind: 'note',
    category: 'evento',
    evidence: 'LABORATÓRIO CONVEX — dados inteiramente sintéticos para teste técnico.',
  };
}

try {
  assert.ok(
    process.argv.includes('--allow-test-data'),
    'Pass --allow-test-data to authorize synthetic writes.',
  );
  const env = parseEnv(await readFile(configurationPath, 'utf8'));
  assert.equal(
    env.DENTEC_BACKEND,
    'convex',
    'Only the explicit Convex experiment may run this script.',
  );
  const config = convexRuntimeConfiguration(env),
    expected =
      process.argv
        .find((argument) => argument.startsWith('--expected-deployment='))
        ?.split('=')[1] || 'oceanic-gazelle-652';
  assert.match(expected, /^[a-z0-9-]+$/);
  assert.equal(
    new URL(config.convexUrl).hostname,
    expected + '.convex.cloud',
    'Unexpected Convex deployment.',
  );
  assert.equal(config.port, 4183, 'The smoke test only targets the isolated port 4183.');
  assert.equal(config.publicOrigin, base, 'The smoke test only targets the isolated local origin.');
  assert.ok(
    !config.setupEmail || config.setupEmail === labEmail,
    'Setup must use the synthetic lab account.',
  );
  sensitive.push(config.bridgeSecret, config.setupCode);
  report.deployment = config.convexUrl;
  report.team = 'diretoria-de-ensino-tecnico-proens';
  let status;
  await check('application-ready', async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        status = expect(
          await call('/api/status', { authenticated: false }),
          200,
          'Application status',
        );
        return { setupRequired: status.setupRequired };
      } catch (error) {
        if (attempt === 5) throw error;
        await delay(1000);
      }
    }
  });
  let credentials;
  try {
    const saved = parseEnv(await readFile(loginPath, 'utf8'));
    credentials = { email: saved.DENTEC_SMOKE_EMAIL, password: saved.DENTEC_SMOKE_PASSWORD };
    assert.equal(credentials.email, labEmail, 'Saved credentials must belong to the lab account.');
    assert.ok(credentials.password, 'Saved credentials are incomplete.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    assert.equal(
      status.setupRequired,
      true,
      'Existing account requires the local lab credentials file.',
    );
    credentials = { email: labEmail, password: 'convex-lab-' + randomBytes(24).toString('hex') };
    await writeFile(
      loginPath,
      '# Conta sintética exclusiva do laboratório Convex. Não versionar nem compartilhar.\n' +
        'DENTEC_SMOKE_EMAIL=' +
        credentials.email +
        '\n' +
        'DENTEC_SMOKE_PASSWORD=' +
        credentials.password +
        '\n',
      { mode: 0o600, flag: 'wx' },
    );
  }
  sensitive.push(credentials.password);
  await chmod(loginPath, 0o600);
  await check('synthetic-admin-setup-and-login', async () => {
    if (status.setupRequired) {
      assert.ok(
        config.setupCode,
        'Set DENTEC_SETUP_CODE in .env.convex.local before starting the server.',
      );
      expect(
        await call('/api/setup', {
          method: 'POST',
          authenticated: false,
          body: {
            code: config.setupCode,
            name: 'LABORATÓRIO CONVEX — administração sintética',
            ...credentials,
          },
        }),
        201,
        'Synthetic admin setup',
      );
    }
    const login = await call('/api/login', {
      method: 'POST',
      authenticated: false,
      body: credentials,
    });
    expect(login, 200, 'Synthetic admin login');
    assert.ok(login.cookie, 'Login did not issue a session cookie.');
    assert.ok(
      login.cookie.startsWith('dentec_convex_lab_session='),
      'The experiment must use its isolated session cookie.',
    );
    cookie = login.cookie;
    sensitive.push(cookie);
    assert.equal(login.data.user.role, 'ADMIN');
    return { role: 'ADMIN', credentialFile: '.env.convex.test-login', credentialMode: '0600' };
  });
  let bootstrap, calendar;
  await check('authenticated-bootstrap-and-test-calendar', async () => {
    expect(await call('/api/bootstrap', { authenticated: false }), 401, 'Anonymous bootstrap');
    bootstrap = expect(await call('/api/bootstrap'), 200, 'Authenticated bootstrap');
    assert.ok(bootstrap.campuses.length > 0);
    calendar = expect(
      await call('/api/calendars', {
        method: 'POST',
        body: {
          campusId: bootstrap.campuses[0].id,
          purpose: 'test',
          courses: 'LABORATÓRIO CONVEX — smoke HTTP sintético ' + started,
          classes: 'DADOS SINTÉTICOS — NÃO UTILIZAR COMO CALENDÁRIO INSTITUCIONAL',
          year: 2027,
          offer: 'integrado',
          regime: 'anual',
        },
      }),
      201,
      'Create test calendar',
    );
    assert.equal(calendar.purpose, 'test');
    report.calendarId = calendar.id;
    return {
      campusCount: bootstrap.campuses.length,
      calendarId: calendar.id,
      purpose: calendar.purpose,
    };
  });
  const calendarPath = '/api/calendars/' + calendar.id;
  await check('calendar-save-and-no-op-preservation', async () => {
    const saved = expect(
      await call(calendarPath, {
        method: 'PUT',
        body: payload(calendar, {
          ...calendar.state,
          events: [syntheticEvent('lab-initial', 'LAB CONVEX — primeiro evento sintético')],
        }),
      }),
      200,
      'Save calendar',
    );
    assert.equal(saved.version, 2);
    calendar = { ...calendar, ...saved };
    const unchanged = expect(
      await call(calendarPath, { method: 'PUT', body: payload(calendar) }),
      200,
      'No-op save',
    );
    assert.equal(unchanged.unchanged, true);
    assert.equal(unchanged.version, calendar.version);
    return {
      savedVersion: saved.version,
      noOpVersion: unchanged.version,
      unchanged: unchanged.unchanged,
    };
  });
  await check('concurrent-calendar-writes', async () => {
    const responses = await Promise.all(
      ['a', 'b'].map((suffix) =>
        call(calendarPath, {
          method: 'PUT',
          body: payload(calendar, {
            ...calendar.state,
            events: [
              ...calendar.state.events,
              syntheticEvent('lab-concurrent-' + suffix, 'LAB CONVEX — concorrência ' + suffix),
            ],
          }),
        }),
      ),
    );
    const statuses = responses.map((response) => response.status).sort();
    assert.deepEqual(statuses, [200, 409]);
    calendar = expect(await call(calendarPath), 200, 'Reopen concurrent winner');
    assert.equal(calendar.version, 3);
    assert.equal(calendar.versions.length, 2);
    return {
      statuses,
      persistedVersion: calendar.version,
      preservedVersions: calendar.versions.length,
    };
  });
  await check('fresh-convex-adapter-persistence', async () => {
    const reopened = await openConvexStore(config.convexUrl, {
      secret: config.bridgeSecret,
      seed: false,
    });
    try {
      const normal = (await reopened.read({ fields: ['calendars'], calendarId: calendar.id }))
          .calendars[0],
        full = (await reopened.read({ fields: ['calendars'], full: true })).calendars.find(
          (entry) => entry.id === calendar.id,
        );
      assert.equal(normal.version, 3);
      assert.equal(normal.versions.length, 2);
      assert.ok(normal.versions.every((version) => !Object.hasOwn(version, 'state')));
      assert.ok(
        full.versions.every((version) => version.state && Array.isArray(version.state.events)),
      );
      assert.equal(full.state.events.length, 2);
      return {
        version: full.version,
        fullSnapshots: full.versions.length,
        normalReadMetadataOnly: true,
      };
    } finally {
      await reopened.close();
    }
  });
  let pdf;
  await check('real-chrome-pdf-export', async () => {
    const response = await call(calendarPath + '/pdf', {
      method: 'POST',
      body: payload(calendar),
      binary: true,
    });
    pdf = expect(response, 200, 'Calendar PDF');
    assert.equal(response.type, 'application/pdf');
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 1000, 'Expected a real rendered PDF.');
    return {
      bytes: pdf.length,
      signature: '%PDF-',
      sha256: createHash('sha256').update(pdf).digest('hex'),
    };
  });
  await check('convex-storage-upload-and-authenticated-download', async () => {
    const filename = 'lab-convex-calendario-sintetico-2026.pdf',
      ticket = expect(
        await call('/api/upload-ticket', {
          method: 'POST',
          body: {
            purpose: 'history',
            calendarId: calendar.id,
            filename,
            size: pdf.length,
          },
        }),
        201,
        'PDF upload ticket',
      );
    assert.equal(ticket.encoding, 'base64');
    assert.equal(ticket.url, '/api/uploads/' + ticket.id);
    expect(
      await call(ticket.url, { method: 'POST', body: { data: pdf.toString('base64') } }),
      201,
      'PDF proxy upload',
    );
    const history = expect(
      await call(calendarPath + '/history', {
        method: 'POST',
        body: {
          year: 2026,
          filename,
          uploadId: ticket.id,
          notes: 'LABORATÓRIO CONVEX — arquivo gerado em teste, sem valor institucional.',
        },
      }),
      201,
      'Attach prior-year PDF fixture',
    );
    expect(
      await call('/api/history/' + history.id, { authenticated: false }),
      401,
      'Anonymous PDF download',
    );
    const downloaded = await call('/api/history/' + history.id, { binary: true });
    expect(downloaded, 200, 'Authenticated PDF download');
    assert.equal(downloaded.type, 'application/pdf');
    assert.deepEqual(downloaded.data, pdf);
    calendar = expect(await call(calendarPath), 200, 'Reopen uploaded history');
    assert.ok(calendar.histories.some((entry) => entry.id === history.id));
    report.historyId = history.id;
    return {
      historyId: history.id,
      bytes: downloaded.data.length,
      byteForByteEqual: true,
      anonymousStatus: 401,
    };
  });
  await check('review-save-export-and-stale-protection', async () => {
    const reviewPath = '/api/reviews/' + calendar.id,
      support = expect(await call(reviewPath), 200, 'Review support'),
      saved = expect(
        await call(reviewPath, {
          method: 'PUT',
          body: {
            calendarVersion: calendar.version,
            catalogueRevision: support.catalogueRevision,
            revision: 0,
            entries: support.criteria.map((criterion) => ({
              id: criterion.id,
              status: 'PENDENTE',
              notes: '',
              reviewed: false,
            })),
            conclusion: 'LABORATÓRIO CONVEX — análise sintética sem validade institucional.',
          },
        }),
        200,
        'Save synthetic review',
      ),
      exported = expect(
        await call(reviewPath + '/export', { method: 'POST', body: { revision: saved.revision } }),
        200,
        'Review export',
      );
    assert.ok(exported.html.includes('LABORATÓRIO CONVEX'));
    const changed = expect(
      await call(calendarPath, {
        method: 'PUT',
        body: payload(calendar, {
          ...calendar.state,
          events: [
            ...calendar.state.events,
            syntheticEvent('lab-stale-check', 'LAB CONVEX — teste de parecer desatualizado'),
          ],
        }),
      }),
      200,
      'Update reviewed calendar',
    );
    calendar = { ...calendar, ...changed };
    const stale = await call(reviewPath + '/export', {
      method: 'POST',
      body: { revision: saved.revision },
    });
    expect(stale, 409, 'Stale review export');
    const refreshed = expect(await call(reviewPath), 200, 'Reopen stale review');
    assert.equal(refreshed.stale, true);
    return {
      criteriaCount: support.criteria.length,
      savedRevision: saved.revision,
      exported: true,
      staleExportStatus: stale.status,
      finalCalendarVersion: calendar.version,
    };
  });
  await check('logout-invalidates-session', async () => {
    expect(await call('/api/logout', { method: 'POST', body: {} }), 200, 'Logout');
    expect(await call('/api/bootstrap'), 401, 'Bootstrap after logout');
    return { afterLogoutStatus: 401 };
  });
  report.passed = true;
} catch (error) {
  let message = String(error.message || 'Smoke test failed.');
  for (const value of sensitive.filter(Boolean)) message = message.split(value).join('[redacted]');
  report.failure = { stage: activeStage, message: message.slice(0, 1500) };
  console.error('FAIL', activeStage, report.failure.message);
  process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString();
  await mkdir(new URL('./', reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log('Evidence:', fileURLToPath(reportPath));
}
