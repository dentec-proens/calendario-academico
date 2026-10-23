import http from 'node:http';
import { staticPortal } from './src/app-server.ts';

try {
  process.loadEnvFile('.env.local');
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
}
const port = Number(process.env.PORT ?? 4183);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Porta local inválida.');
const server = http.createServer(staticPortal());
server.listen(port, '127.0.0.1', () => console.log(`Portal PROENS — http://127.0.0.1:${port}`));
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE' ? 'A porta do portal está ocupada.' : error.message);
  process.exitCode = 1;
});
process.once('SIGINT', () => server.close());
process.once('SIGTERM', () => server.close());
