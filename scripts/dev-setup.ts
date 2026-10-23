import { spawn } from 'node:child_process';
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { environments } from '../config/environments.ts';
import {
  assertNoTargetOverrides,
  convexCli,
  readDevEnvironment,
  readLocalEnvironment,
  root,
} from './environment.ts';

type AuthKeys = { JWT_PRIVATE_KEY: string; JWKS: string };
type Initialization = { initialized: boolean; setupRequired: boolean };

export function generateAuthKeys(): AuthKeys {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    JWT_PRIVATE_KEY: privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .trimEnd()
      .replace(/\n/g, ' '),
    JWKS: JSON.stringify({ keys: [{ use: 'sig', ...publicKey.export({ format: 'jwk' }) }] }),
  };
}

export function validateAuthKeys({ JWT_PRIVATE_KEY, JWKS }: AuthKeys): void {
  try {
    // The official Auth key format uses spaces in its PKCS8 PEM. Read the DER
    // body directly to validate either that format or a conventional PEM.
    if (
      !JWT_PRIVATE_KEY.startsWith('-----BEGIN PRIVATE KEY-----') ||
      !JWT_PRIVATE_KEY.trimEnd().endsWith('-----END PRIVATE KEY-----')
    )
      throw Error();
    const body = JWT_PRIVATE_KEY.replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, '');
    const privateKey = createPrivateKey({
      key: Buffer.from(body, 'base64'),
      type: 'pkcs8',
      format: 'der',
    });
    const publicKey = createPublicKey(privateKey).export({ format: 'jwk' });
    const jwks: unknown = JSON.parse(JWKS);
    if (
      !jwks ||
      typeof jwks !== 'object' ||
      !('keys' in jwks) ||
      !Array.isArray(jwks.keys) ||
      !jwks.keys.every(
        (key: unknown): key is Record<string, unknown> =>
          !!key &&
          typeof key === 'object' &&
          !Array.isArray(key) &&
          !['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some((field) => field in key),
      ) ||
      !jwks.keys.some((key) => key.kty === 'RSA' && key.n === publicKey.n && key.e === publicKey.e)
    )
      throw Error();
  } catch {
    throw Error(
      'JWT_PRIVATE_KEY/JWKS existentes são inválidos ou não formam um par. Corrija o dev no dashboard; nenhuma chave existente foi substituída.',
    );
  }
}

function runCli(
  args: string[],
  environment: NodeJS.ProcessEnv,
  options: { visible?: boolean; input?: string } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [convexCli, ...args], {
      cwd: root,
      env: environment,
      stdio: options.visible ? 'inherit' : ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    // env get may return credentials. Never relay its output or a CLI error
    // containing input values to the terminal or a shell command line.
    child.stderr?.resume();
    child.once('error', () => reject(Error('Não foi possível iniciar a CLI do Convex.')));
    child.once('close', (code) => {
      if (code === 0) resolve(stdout.replace(/\r?\n$/, ''));
      else reject(Error(`Convex ${args[0]} falhou. Verifique sua conta e o deployment dev.`));
    });
    child.stdin?.on('error', () => {});
    child.stdin?.end(options.input);
  });
}

function assertUnconfiguredEnvironment(): void {
  for (const key of ['CONVEX_DEPLOYMENT', 'VITE_CONVEX_URL', 'VITE_CONVEX_SITE_URL']) {
    if (process.env[key])
      throw Error(`Remova ${key} do shell antes de configurar seu primeiro dev.`);
  }
  try {
    const legacy = parseEnv(readFileSync(join(root, '.env'), 'utf8'));
    assertNoTargetOverrides(legacy);
    if (legacy.CONVEX_DEPLOYMENT)
      throw Error('Remova CONVEX_DEPLOYMENT de .env antes de configurar seu dev em .env.local.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function parseInitialization(raw: string): Initialization {
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== 'object' ||
    !('initialized' in value) ||
    typeof value.initialized !== 'boolean' ||
    !('setupRequired' in value) ||
    typeof value.setupRequired !== 'boolean'
  )
    throw Error('O Convex retornou uma resposta de inicialização inesperada.');
  return { initialized: value.initialized, setupRequired: value.setupRequired };
}

export async function setupDev(): Promise<void> {
  assertNoTargetOverrides(process.env);
  const local = readLocalEnvironment();
  if (local) assertNoTargetOverrides(local);
  if (local?.CONVEX_DEPLOYMENT) {
    const dev = readDevEnvironment();
    console.log(`Preparando o dev selecionado: ${dev.CONVEX_DEPLOYMENT}.`);
    await runCli(
      ['dev', '--once', '--env-file', '.env.local'],
      { ...process.env, ...dev },
      { visible: true },
    );
  } else {
    assertUnconfiguredEnvironment();
    console.log('Selecionando seu dev pessoal no projeto Calendário Acadêmico da Dentec.');
    await runCli(
      [
        'dev',
        '--configure',
        'existing',
        '--team',
        environments.convex.team,
        '--project',
        environments.convex.project,
        '--dev-deployment',
        'cloud',
        '--once',
      ],
      process.env,
      { visible: true },
    );
  }

  const dev = readDevEnvironment();
  const environment = { ...process.env, ...dev };
  const deployment = dev.CONVEX_DEPLOYMENT.slice('dev:'.length);
  const target = ['--env-file', '.env.local', '--deployment', deployment];
  const names = new Set(
    (await runCli(['env', 'list', '--names-only', ...target], environment)).split(/\r?\n/),
  );
  const get = (name: string) => runCli(['env', 'get', name, ...target], environment);
  const setMissing = async (values: Record<string, string>) => {
    const lines = Object.entries(values).map(([name, value]) => {
      if (value.includes("'")) throw Error('Formato inesperado de variável de instalação.');
      return `${name}='${value}'`;
    });
    if (lines.length)
      await runCli(['env', 'set', ...target], environment, { input: lines.join('\n') });
  };
  const hasPrivate = names.has('JWT_PRIVATE_KEY');
  const hasPublic = names.has('JWKS');
  if (hasPrivate !== hasPublic)
    throw Error(
      'O dev contém somente uma das chaves JWT_PRIVATE_KEY/JWKS. Restaure o par no dashboard antes de continuar; nenhuma chave foi substituída.',
    );
  const keys = hasPrivate
    ? { JWT_PRIVATE_KEY: await get('JWT_PRIVATE_KEY'), JWKS: await get('JWKS') }
    : generateAuthKeys();
  validateAuthKeys(keys);
  const missing: Record<string, string> = hasPrivate ? {} : keys;
  if (!names.has('SITE_URL')) missing.SITE_URL = `http://127.0.0.1:${dev.PORT}`;
  await setMissing(missing);

  const initialized = parseInitialization(
    await runCli(
      [
        'run',
        'devSetup:initialize',
        JSON.stringify({ expectedCloudUrl: dev.VITE_CONVEX_URL }),
        ...target,
      ],
      environment,
    ),
  );
  console.log(
    initialized.initialized
      ? 'Dev vazio inicializado com campi, catálogo institucional e coleções vazias.'
      : 'Os dados existentes do dev foram preservados.',
  );
  if (initialized.setupRequired) {
    const code = names.has('DENTEC_SETUP_CODE')
      ? await get('DENTEC_SETUP_CODE')
      : randomBytes(24).toString('base64url');
    if (!code) throw Error('DENTEC_SETUP_CODE está vazio. Corrija a variável no dashboard do dev.');
    if (!names.has('DENTEC_SETUP_CODE')) await setMissing({ DENTEC_SETUP_CODE: code });
    console.log(`Código privado para criar o primeiro ADMIN neste dev: ${code}`);
    console.log(
      'Na tela inicial, informe seu nome, este código, seu e-mail institucional e uma senha própria. O código deixa de funcionar após a primeira conta.',
    );
  }
  console.log(`Execute pnpm dev e abra http://127.0.0.1:${dev.PORT}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await setupDev();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Não foi possível preparar seu dev.');
    process.exitCode = 1;
  }
}
