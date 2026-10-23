function invalid(message) {
  throw Object.assign(Error(message), { code: 'DENTEC_CONFIG' });
}

export function persistenceBackend(env = process.env) {
  const backend = env.DENTEC_BACKEND || 'postgres';
  if (!['postgres', 'convex'].includes(backend))
    invalid('DENTEC_BACKEND deve ser postgres ou convex.');
  return backend;
}

function origin(value, { local = false, label }) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    invalid(`${label} deve ser uma origem HTTPS válida (ou HTTP local em desenvolvimento).`);
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
    invalid(`${label} deve ser uma origem HTTPS válida (ou HTTP local em desenvolvimento).`);
  return endpoint.origin;
}

// This configuration belongs to the isolated persistence experiment. The SQL
// configuration remains unchanged so its baseline tests exercise the old path.
export function convexRuntimeConfiguration(env = process.env) {
  const hosted = env.VERCEL === '1',
    production = hosted || env.NODE_ENV === 'production';
  const port = Number(env.PORT || 4183);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    invalid('PORT deve estar entre 1 e 65535.');
  if (!env.CONVEX_URL?.trim())
    invalid('Configure CONVEX_URL para o deployment de teste do Convex.');
  const convexUrl = origin(env.CONVEX_URL.trim(), { local: !production, label: 'CONVEX_URL' });
  const bridgeSecret = env.DENTEC_CONVEX_BRIDGE_SECRET?.trim();
  if (!bridgeSecret || bridgeSecret.length < 32)
    invalid('DENTEC_CONVEX_BRIDGE_SECRET deve conter pelo menos 32 caracteres.');
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
  const setupCode = env.DENTEC_SETUP_CODE || undefined;
  const setupEmail = env.DENTEC_SETUP_EMAIL?.trim().toLowerCase() || undefined;
  if ((production && !setupCode) || (setupCode && setupCode.length < 32))
    invalid('DENTEC_SETUP_CODE deve conter pelo menos 32 caracteres.');
  if ((production && !setupEmail) || (setupEmail && !/^[^\s@]+@ifpr\.edu\.br$/.test(setupEmail)))
    invalid(
      'DENTEC_SETUP_EMAIL deve informar o e-mail institucional @ifpr.edu.br da primeira administração.',
    );
  return {
    backend: 'convex',
    hosted,
    production,
    port,
    convexUrl,
    bridgeSecret,
    publicOrigin,
    setupCode,
    setupEmail,
  };
}
