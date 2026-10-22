function invalid(message) {
  throw Object.assign(Error(message), { code: 'DENTEC_CONFIG' });
}

// Development and deployment use the same database adapter. Environment flags
// choose deployment requirements, never a different persistence format.
export function databaseConnectionString(env = process.env) {
  const connectionString = (env.POSTGRES_URL || env.DATABASE_URL || '').trim();
  if (!connectionString)
    invalid(
      'Configure POSTGRES_URL (ou DATABASE_URL) no arquivo .env ou no ambiente. PostgreSQL é obrigatório; execute pnpm run db:migrate antes de iniciar.',
    );
  let endpoint;
  try {
    endpoint = new URL(connectionString);
  } catch {
    invalid('POSTGRES_URL/DATABASE_URL deve ser uma URL PostgreSQL válida.');
  }
  if (!['postgres:', 'postgresql:'].includes(endpoint.protocol) || !endpoint.hostname)
    invalid('POSTGRES_URL/DATABASE_URL deve ser uma URL PostgreSQL válida.');
  return connectionString;
}

function origin(value, { local = false, label }) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    invalid(
      `${label} deve ser uma origem HTTPS válida${local ? ' (ou HTTP em localhost para desenvolvimento)' : ''}.`,
    );
  }
  const localHttp =
    local &&
    endpoint.protocol === 'http:' &&
    ['127.0.0.1', 'localhost'].includes(endpoint.hostname);
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname !== '/' ||
    endpoint.search ||
    endpoint.hash ||
    (endpoint.protocol !== 'https:' && !localHttp)
  )
    invalid(
      `${label} deve ser uma origem HTTPS válida${local ? ' (ou HTTP em localhost para desenvolvimento)' : ''}.`,
    );
  return endpoint.origin;
}

export function runtimeConfiguration(env = process.env) {
  const hosted = env.VERCEL === '1',
    production = hosted || env.NODE_ENV === 'production';
  const port = Number(env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    invalid('PORT deve estar entre 1 e 65535.');
  const connectionString = databaseConnectionString(env);
  const deploymentHost = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL;
  const publicUrl =
    env.DENTEC_PUBLIC_URL ||
    (hosted && deploymentHost
      ? 'https://' + deploymentHost
      : !production
        ? 'http://127.0.0.1:' + port
        : null);
  if (!publicUrl) invalid('Configure DENTEC_PUBLIC_URL com a origem HTTPS pública da aplicação.');
  const publicOrigin = origin(publicUrl, { local: !production, label: 'DENTEC_PUBLIC_URL' });
  const storageUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const storageKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    (storageUrl && !storageKey) ||
    (!storageUrl && storageKey) ||
    (production && (!storageUrl || !storageKey))
  )
    invalid(
      'Configure SUPABASE_URL e SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY) juntas. O armazenamento privado de PDFs é obrigatório em produção.',
    );
  const storage = storageUrl
    ? { url: origin(storageUrl, { label: 'SUPABASE_URL' }), key: storageKey }
    : null;
  const setupCode = env.DENTEC_SETUP_CODE || undefined;
  const setupEmail = env.DENTEC_SETUP_EMAIL?.trim().toLowerCase() || undefined;
  if ((production && !setupCode) || (setupCode && setupCode.length < 32))
    invalid('DENTEC_SETUP_CODE deve conter pelo menos 32 caracteres.');
  if ((production && !setupEmail) || (setupEmail && !/^[^\s@]+@ifpr\.edu\.br$/.test(setupEmail)))
    invalid(
      'DENTEC_SETUP_EMAIL deve informar o e-mail institucional @ifpr.edu.br da primeira administração.',
    );
  return {
    hosted,
    production,
    port,
    connectionString,
    publicOrigin,
    storage,
    setupCode,
    setupEmail,
  };
}
