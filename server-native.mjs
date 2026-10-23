import http from 'node:http';
import { nativeStatic } from './src/native-static.mjs';

const port = Number(process.env.PORT || 4183);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Porta local inválida.');
const server = http.createServer(nativeStatic());
server.listen(port, '127.0.0.1', () =>
  console.log(`DENTEC/PROENS — Convex nativo — http://127.0.0.1:${port}`),
);
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? 'A porta do experimento está ocupada.'
      : 'Não foi possível servir o portal.',
  );
  process.exitCode = 1;
});
process.once('SIGINT', () => server.close());
process.once('SIGTERM', () => server.close());
