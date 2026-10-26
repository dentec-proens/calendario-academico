import { environments } from '../config/environments.ts';

export type SmokeConfiguration = {
  portalUrl: string;
  backendUrl: string;
  deploymentUrl?: string;
  protection?: { name: string; value: string };
  calendarId: string;
  userId: string;
  email: string;
  password: string;
};

export function releaseSmokeConfiguration(environment = process.env): SmokeConfiguration {
  const {
    DENTEC_RELEASE_SMOKE_CALENDAR_ID: calendarId,
    DENTEC_RELEASE_SMOKE_USER_ID: userId,
    DENTEC_RELEASE_SMOKE_EMAIL: email,
    DENTEC_RELEASE_SMOKE_PASSWORD: password,
  } = environment;
  if (!calendarId || !userId || !email || !password)
    throw Error(
      'Configure conta operacional ADMIN local e calendário de teste explícitos para o smoke da publicação.',
    );
  const candidate = environment.DENTEC_RELEASE_CANDIDATE_URL;
  if (candidate && !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(candidate))
    throw Error('O smoke exige a URL imutável do candidato Vercel.');
  return {
    ...(candidate && environment.VERCEL_OIDC_TOKEN
      ? {
          protection: {
            name: 'x-vercel-trusted-oidc-idp-token',
            value: environment.VERCEL_OIDC_TOKEN,
          },
        }
      : {}),
    portalUrl: environments.production.portalUrl,
    ...(candidate ? { deploymentUrl: candidate } : {}),
    backendUrl: environments.production.url,
    calendarId,
    userId,
    email,
    password,
  };
}
