import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { environments } from '../config/environments.ts';
import { assertBackupDirectory } from './release-backup.ts';

type Variables = Record<string, string | undefined>;
export interface ReleaseEnvironment {
  token: string;
  backupDirectory: string;
}

export const releaseEnvFile = '.vercel/release.env';
const tokenKey = 'VERCEL_TOKEN';
const backupKey = 'DENTEC_RELEASE_BACKUP_DIR';
const suggestedBackup = join(homedir(), 'dentec-release-backups');
const tokenSteps = [
  `Crie um token em https://vercel.com/account/tokens com escopo da equipe ${environments.vercel.team}, projeto ${environments.vercel.project} e expiração definida (se a promoção for recusada, use a equipe com All Projects). O valor começa com vcp_, aparece uma única vez e não deve ser colado no terminal.`,
];
const backupSteps = [
  `Crie a pasta privada de backups, fora do repositório: mkdir -m 700 -p "${suggestedBackup}"`,
];

function setup(problem: string, file: string, steps: string[], lines: string[]): string {
  return [
    problem,
    '',
    ...[...steps, `Grave pelo editor em ${file} (permissão 600):`].map(
      (step, index) => `${index + 1}. ${step}`,
    ),
    '',
    ...lines.map((line) => `   ${line}`),
    '',
    'Confira com pnpm deploy:production --dry-run.',
  ].join('\n');
}

// O arquivo é a única fonte das credenciais da release; o shell só pode repetir os mesmos valores.
export function readReleaseEnvironment(
  root: string,
  inherited: Variables = process.env,
  file = inherited.DENTEC_RELEASE_ENV_FILE || join(root, releaseEnvFile),
): ReleaseEnvironment {
  const name = file === join(root, releaseEnvFile) ? releaseEnvFile : file;
  const tokenLine = `${tokenKey}=vcp_...`;
  const backupLine = `${backupKey}=${suggestedBackup}`;
  let mode: number;
  try {
    mode = statSync(file).mode;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    throw Error(
      setup(
        `Falta ${name}, com as credenciais da release. Configure uma única vez:`,
        name,
        [
          ...tokenSteps,
          ...backupSteps,
          `Crie o arquivo privado: mkdir -p .vercel && (umask 077 && touch ${name})`,
        ],
        [tokenLine, backupLine],
      ),
    );
  }
  if (mode & 0o077) throw Error(`${name} guarda credenciais e deve ser privado: chmod 600 ${name}`);
  const values = parseEnv(readFileSync(file, 'utf8'));
  const unknown = Object.keys(values).filter((key) => key !== tokenKey && key !== backupKey);
  if (unknown.length)
    throw Error(`${name} aceita somente ${tokenKey} e ${backupKey}. Remova ${unknown.join(', ')}.`);
  if (!values[tokenKey])
    throw Error(setup(`Falta ${tokenKey} em ${name}.`, name, tokenSteps, [tokenLine]));
  if (!values[backupKey])
    throw Error(
      setup(
        `Falta ${backupKey} em ${name}: a release exporta os dados antes de publicar um backend alterado.`,
        name,
        backupSteps,
        [backupLine],
      ),
    );
  for (const key of [tokenKey, backupKey]) {
    if (inherited[key] && inherited[key] !== values[key])
      throw Error(`${key} no shell diverge de ${name}. Execute unset ${key} e repita.`);
  }
  assertBackupDirectory(root, values[backupKey]);
  return { token: values[tokenKey], backupDirectory: values[backupKey] };
}
