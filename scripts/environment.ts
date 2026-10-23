import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { environments } from '../config/environments.ts';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const convexCli = join(root, 'node_modules/convex/bin/main.js');
type Variables = Record<string, string | undefined>;

// Esses seletores têm precedência sobre a seleção normal da CLI.
export function assertNoTargetOverrides(env: Variables): void {
  for (const key of [
    'CONVEX_DEPLOY_KEY',
    'CONVEX_DEPLOYMENT_TOKEN',
    'CONVEX_SELF_HOSTED_URL',
    'CONVEX_SELF_HOSTED_ADMIN_KEY',
  ]) {
    if (env[key]) throw Error(`Remova ${key} para usar os ambientes individuais da Dentec.`);
  }
}

export function readLocalEnvironment(directory = root): Variables | undefined {
  try {
    return parseEnv(readFileSync(join(directory, '.env.local'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export function validateDevEnvironment(env: Variables): Record<string, string> {
  assertNoTargetOverrides(env);
  const match = /^dev:([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(env.CONVEX_DEPLOYMENT ?? '');
  if (!match || match[1] === environments.production.deployment)
    throw Error(
      'Desenvolvimento exige CONVEX_DEPLOYMENT=dev:seu-deployment. Execute pnpm dev:setup.',
    );
  const url = `https://${match[1]}.convex.cloud`;
  const siteUrl = `https://${match[1]}.convex.site`;
  if (
    env.VITE_CONVEX_URL !== url ||
    (env.VITE_CONVEX_SITE_URL && env.VITE_CONVEX_SITE_URL !== siteUrl)
  )
    throw Error('As URLs do portal precisam pertencer ao mesmo deployment dev de .env.local.');
  const port = env.PORT || '4183';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw Error('PORT deve ser uma porta entre 1 e 65535.');
  return {
    CONVEX_DEPLOYMENT: env.CONVEX_DEPLOYMENT!,
    VITE_CONVEX_URL: url,
    VITE_CONVEX_SITE_URL: siteUrl,
    PORT: port,
  };
}

export function readDevEnvironment(
  directory = root,
  inherited: Variables = process.env,
): Record<string, string> {
  assertNoTargetOverrides(inherited);
  const local = readLocalEnvironment(directory);
  if (!local)
    throw Error('Falta .env.local. Execute pnpm dev:setup para selecionar seu dev na Dentec.');
  assertNoTargetOverrides(local);
  const selected = validateDevEnvironment({ ...local, PORT: inherited.PORT || local.PORT });
  for (const key of ['CONVEX_DEPLOYMENT', 'VITE_CONVEX_URL', 'VITE_CONVEX_SITE_URL']) {
    if (inherited[key] && inherited[key] !== selected[key])
      throw Error(
        `${key} no shell diverge de .env.local. Remova a sobreposição antes de continuar.`,
      );
  }
  return selected;
}

export function assertProductionTarget(url: string | undefined): void {
  if (url !== environments.production.url)
    throw Error(
      `O Convex selecionou outro destino. A publicação exige ${environments.production.url}.`,
    );
}

export function validateProductionBuild(env: Variables): void {
  if (env.VERCEL_ENV !== 'production') return;
  assertProductionTarget(env.VITE_CONVEX_URL);
  if (env.VITE_CONVEX_SITE_URL !== environments.production.siteUrl)
    throw Error(
      `O build de produção exige VITE_CONVEX_SITE_URL=${environments.production.siteUrl}.`,
    );
}
