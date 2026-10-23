import { assertProductionTarget } from './environment.ts';

// Convex --cmd fornece a URL resolvida antes de publicar funções, índices e schema.
assertProductionTarget(process.env.DENTEC_DEPLOYMENT_URL);
