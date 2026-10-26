import { environments } from '../config/environments.ts';

export type SmokeConfiguration = {
  portalUrl: string;
  backendUrl: string;
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
  return {
    portalUrl: environments.production.portalUrl,
    backendUrl: environments.production.url,
    calendarId,
    userId,
    email,
    password,
  };
}
