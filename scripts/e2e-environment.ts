import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { environments } from '../config/environments.ts';
import { readDevEnvironment, root } from './environment.ts';

type Variables = Record<string, string | undefined>;

export function serializeE2EEnvironment(values: Record<string, string>): string {
  return (
    Object.entries(values)
      .map(([name, value]) => {
        const quote = ["'", '`', '"'].find((candidate) => !value.includes(candidate));
        if (!/^[A-Z][A-Z0-9_]*$/.test(name) || !quote)
          throw Error(`Configuração E2E não pode representar ${name}.`);
        const assignment = `${name}=${quote}${value}${quote}`;
        if (parseEnv(assignment)[name] !== value)
          throw Error(`Configuração E2E não preserva ${name}.`);
        return assignment;
      })
      .join('\n') + '\n'
  );
}

export function readE2EEnvironment(
  directory = root,
  inherited: Variables = process.env,
): Variables {
  let local: Variables = {};
  try {
    local = parseEnv(readFileSync(join(directory, '.env.e2e.local'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return {
    ...local,
    ...Object.fromEntries(Object.entries(inherited).filter(([, value]) => value !== undefined)),
  };
}

export function validateE2EEnvironment(values: Variables, development?: Variables) {
  const base = values.DENTEC_NATIVE_BROWSER_URL?.trim();
  const email = values.DENTEC_NATIVE_TEST_EMAIL?.trim();
  const password = values.DENTEC_NATIVE_TEST_PASSWORD;
  if (!base || !email || !password?.trim())
    throw Error(
      'E2E exige URL do navegador, e-mail e senha de teste configurados. Execute pnpm e2e:setup.',
    );
  const url = new URL(base);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw Error('DENTEC_NATIVE_BROWSER_URL deve ser uma URL HTTP(S) sem credenciais.');
  if (url.origin === new URL(environments.production.portalUrl).origin)
    throw Error('E2E nunca executa no portal de produção.');
  const disposable = values.DENTEC_DISPOSABLE_E2E === '1';
  const selectedDev = values.DENTEC_DEVELOPMENT_E2E === '1';
  if (disposable === selectedDev)
    throw Error(
      'Escolha explicitamente um destino E2E descartável ou o desenvolvimento local verificado.',
    );
  if (selectedDev) {
    if (!development) throw Error('O desenvolvimento E2E exige conferir .env.local.');
    if (
      values.DENTEC_NATIVE_DEPLOYMENT !== development.CONVEX_DEPLOYMENT ||
      values.DENTEC_NATIVE_BACKEND_URL !== development.VITE_CONVEX_URL ||
      development.CONVEX_DEPLOYMENT === `prod:${environments.production.deployment}` ||
      development.VITE_CONVEX_URL === environments.production.url ||
      !/^dev:[a-z0-9-]+$/.test(development.CONVEX_DEPLOYMENT ?? '') ||
      url.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.port !== development.PORT
    )
      throw Error(
        'O E2E de desenvolvimento deve usar o frontend local e o mesmo dev de .env.local, nunca produção.',
      );
    if (
      !/^[a-f0-9]{12}$/.test(values.DENTEC_NATIVE_TEST_RUN_ID ?? '') ||
      email !== `e2e-${values.DENTEC_NATIVE_TEST_RUN_ID}@ifpr.edu.br` ||
      !values.DENTEC_NATIVE_TEST_CAMPUS_ID ||
      !/^\d{4}$/.test(values.DENTEC_NATIVE_TEST_YEAR ?? '') ||
      Number(values.DENTEC_NATIVE_TEST_YEAR) < 7000 ||
      Number(values.DENTEC_NATIVE_TEST_YEAR) > 8999
    )
      throw Error(
        'O E2E de desenvolvimento exige conta, campus e ano próprios preparados por e2e:setup.',
      );
  }
  return {
    base: url.href.replace(/\/$/, ''),
    email,
    password,
    mode: selectedDev ? ('development' as const) : ('disposable' as const),
    campusId: values.DENTEC_NATIVE_TEST_CAMPUS_ID,
    year: Number(values.DENTEC_NATIVE_TEST_YEAR ?? '2097'),
    runId: values.DENTEC_NATIVE_TEST_RUN_ID,
    backendUrl: values.DENTEC_NATIVE_BACKEND_URL,
  };
}

export function configuredE2ETarget(values = readE2EEnvironment(), directory = root) {
  return validateE2EEnvironment(
    values,
    values.DENTEC_DEVELOPMENT_E2E === '1' ? readDevEnvironment(directory, values) : undefined,
  );
}
