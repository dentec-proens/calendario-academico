import { serializeE2EEnvironment } from './e2e-environment.ts';
import { preparePdfRuntime } from './prepare-pdf-runtime.ts';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { passwordCrypto } from '../convex/authCrypto.ts';
import { generateAuthKeys } from './dev-setup.ts';
import { convexCli, readDevEnvironment, root } from './environment.ts';

async function run(
  args: string[],
  environment: NodeJS.ProcessEnv,
  input?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [convexCli, ...args], {
      cwd: root,
      env: environment,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (value: string) => {
      stdout += value;
    });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    child.once('error', () => reject(Error('Não foi possível iniciar a CLI Convex.')));
    child.once('exit', (code) => {
      if (code === 0) resolve(stdout.trim());
      else
        reject(
          Error(
            `A preparação E2E falhou na operação Convex ${args[0]}. O dev selecionado foi preservado; confira o diagnóstico local antes de repetir.`,
          ),
        );
    });
  });
}

function restorationPdf(year: number) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = `BT /F1 18 Tf 50 780 Td (Referencia sintetica E2E ${year}) Tj ET`;
  objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  let result = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(result));
    result += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  result += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}

const selected = readDevEnvironment();
const environment = { ...process.env, ...selected };
const target = ['--env-file', '.env.local', '--deployment', selected.CONVEX_DEPLOYMENT.slice(4)];
console.log(
  `Preparando E2E no desenvolvimento selecionado: ${selected.CONVEX_DEPLOYMENT}. Nenhum reset de dados será executado.`,
);
await run(
  [
    'dev',
    '--once',
    '--env-file',
    '.env.local',
    '--typecheck',
    'disable',
    '--codegen',
    'disable',
    '--tail-logs',
    'disable',
  ],
  environment,
);

await preparePdfRuntime(environment, target);

const names = new Set(
  (await run(['env', 'list', '--names-only', ...target], environment)).split(/\r?\n/),
);
if (names.has('JWT_PRIVATE_KEY') !== names.has('JWKS'))
  throw Error(
    'O dev tem somente uma chave de autenticação. Nenhuma chave existente foi substituída.',
  );
const values: Record<string, string> = names.has('JWT_PRIVATE_KEY') ? {} : generateAuthKeys();
values.SITE_URL = `http://127.0.0.1:${selected.PORT}`;
await run(
  ['env', 'set', ...target],
  environment,
  Object.entries(values)
    .map(([name, value]) => `${name}='${value}'`)
    .join('\n'),
);

let previous: Record<string, string | undefined> = {};
try {
  previous = parseEnv(await readFile(join(root, '.env.e2e.local'), 'utf8'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const existingRunId = previous.DENTEC_NATIVE_TEST_RUN_ID;
const runId =
  typeof existingRunId === 'string' &&
  /^[a-f0-9]{12}$/.test(existingRunId) &&
  previous.DENTEC_NATIVE_DEPLOYMENT === selected.CONVEX_DEPLOYMENT
    ? existingRunId
    : randomBytes(6).toString('hex');
const password =
  previous.DENTEC_NATIVE_TEST_PASSWORD || `SyntheticE2E!${randomBytes(24).toString('base64url')}`;
const secret = await passwordCrypto.hashSecret(password);
const prepared: { campusId: string; userId: string; year: number } = JSON.parse(
  await run(
    [
      'run',
      'devSetup:prepareE2E',
      JSON.stringify({
        expectedCloudUrl: selected.VITE_CONVEX_URL,
        runId,
        secret,
        preferredYear: 7000 + (Number.parseInt(randomBytes(2).toString('hex'), 16) % 2000),
      }),
      ...target,
      '--codegen',
      'disable',
    ],
    environment,
  ),
);
if (!prepared.campusId || !prepared.userId || !Number.isInteger(prepared.year))
  throw Error('O dev não confirmou a preparação E2E.');
const directory = join(root, 'test', '.temp', 'e2e', runId);
await mkdir(directory, { recursive: true });
const pdf = restorationPdf(prepared.year - 1);
await writeFile(join(directory, 'restoration-upload.pdf'), pdf);
const restoration: { calendarId: string; historyId: string; documentId: string } = JSON.parse(
  await run(
    [
      'run',
      'devSetup:prepareE2ERestoration',
      JSON.stringify({
        expectedCloudUrl: selected.VITE_CONVEX_URL,
        runId,
        year: prepared.year,
        hash: createHash('sha256').update(pdf).digest('hex'),
      }),
      ...target,
      '--codegen',
      'disable',
    ],
    environment,
  ),
);
const fixture = join(directory, 'restoration.json');
await writeFile(
  fixture,
  JSON.stringify(
    { ...restoration, runId, campusId: prepared.campusId, year: prepared.year },
    null,
    2,
  ),
);
const configured: Record<string, string> = {
  DENTEC_DEVELOPMENT_E2E: '1',
  DENTEC_NATIVE_DEPLOYMENT: selected.CONVEX_DEPLOYMENT,
  DENTEC_NATIVE_BACKEND_URL: selected.VITE_CONVEX_URL,
  DENTEC_NATIVE_BROWSER_URL: `http://127.0.0.1:${selected.PORT}`,
  DENTEC_NATIVE_TEST_RUN_ID: runId,
  DENTEC_NATIVE_TEST_CAMPUS_ID: prepared.campusId,
  DENTEC_NATIVE_TEST_YEAR: String(prepared.year),
  DENTEC_NATIVE_TEST_EMAIL: `e2e-${runId}@ifpr.edu.br`,
  DENTEC_NATIVE_TEST_PASSWORD: password,
  DENTEC_NATIVE_RESTORE_FIXTURE: ['test', '.temp', 'e2e', runId, 'restoration.json'].join('/'),
};
await writeFile(join(root, '.env.e2e.local'), serializeE2EEnvironment(configured), { mode: 0o600 });
console.log(
  'Configuração E2E salva em .env.e2e.local (ignorado pelo Git). Conta, campus, ano e fontes são exclusivos dos testes.',
);
console.log(
  `Frontend esperado: ${configured.DENTEC_NATIVE_BROWSER_URL}. Inicie pnpm dev e execute pnpm test:e2e.`,
);
