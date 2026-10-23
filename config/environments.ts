// Identificadores públicos. Credenciais ficam na conta de cada desenvolvedor e no Convex.
export const environments = {
  convex: {
    team: 'diretoria-de-ensino-tecnico-proens',
    project: 'calendario-academico',
  },
  production: {
    deployment: 'exuberant-cheetah-138',
    url: 'https://exuberant-cheetah-138.convex.cloud',
    siteUrl: 'https://exuberant-cheetah-138.convex.site',
    portalUrl: 'https://calendario-academico-phi.vercel.app',
  },
  git: { repository: 'dentec-proens/calendario-academico', branch: 'main' },
  vercel: { team: 'dentec-proens', project: 'calendario-academico' },
} as const;
