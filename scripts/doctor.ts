import { environments } from '../config/environments.ts';
import { readDevEnvironment } from './environment.ts';

try {
  const env = readDevEnvironment();
  console.log(`Dev individual: ${env.CONVEX_DEPLOYMENT}`);
  console.log(`Portal local: http://127.0.0.1:${env.PORT}`);
  console.log(`Convex: ${env.VITE_CONVEX_URL}`);
  console.log(`Projeto da equipe: ${environments.convex.team}/${environments.convex.project}`);
  console.log(`Produção: ${environments.production.url}`);
  console.log('Configuração local coerente. Nenhuma conexão ou alteração remota foi realizada.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Não foi possível conferir o ambiente.');
  process.exitCode = 1;
}
