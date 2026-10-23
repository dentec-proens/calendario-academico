import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';

const maximumSize = 8_000_000;
const reference = (name) => makeFunctionReference('files:' + name);
const unavailable = () =>
  Object.assign(Error('Armazenamento indisponível. Tente novamente.'), { status: 503 });

function objectPath(path) {
  if (!/^(uploads|exports)\/[\w-]+\.pdf$/.test(path))
    throw Object.assign(Error('Destino de arquivo inválido.'), { status: 400 });
  return path;
}

function pdfBytes(bytes) {
  if (bytes.length < 5 || bytes.length > maximumSize || bytes.subarray(0, 5).toString() !== '%PDF-')
    throw Object.assign(Error('Envie um PDF de até 8 MB.'), { status: 400 });
  return bytes;
}

// The browser only uses authenticated application endpoints. Convex storage
// URLs and the bridge secret stay on this server, including on downloads.
export function createConvexFiles({ url, secret, client: providedClient, fetch: fetcher = fetch }) {
  if (!secret || (!providedClient && !url))
    throw Error('Configure a URL e o segredo da ponte Convex.');
  const client = providedClient || new ConvexHttpClient(url);
  const mutation = (name, args = {}) => client.mutation(reference(name), { ...args, secret });
  const query = (name, args) => client.query(reference(name), { ...args, secret });

  return {
    uploadMode: 'proxy',
    async read(path) {
      objectPath(path);
      let response;
      try {
        const url = await query('downloadUrl', { path });
        if (!url) throw Object.assign(Error('Arquivo não encontrado.'), { status: 404 });
        response = await fetcher(url, { signal: AbortSignal.timeout(120_000) });
      } catch (error) {
        if (error.status === 404) throw error;
        throw unavailable();
      }
      if (!response.ok || !response.body) throw unavailable();
      if (Number(response.headers.get('content-length')) > maximumSize)
        throw Object.assign(Error('Arquivo maior que 8 MB.'), { status: 400 });
      let size = 0;
      const chunks = [];
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > maximumSize)
          throw Object.assign(Error('Arquivo maior que 8 MB.'), { status: 400 });
        chunks.push(Buffer.from(chunk));
      }
      return pdfBytes(Buffer.concat(chunks));
    },
    async write(path, bytes) {
      objectPath(path);
      pdfBytes(bytes);
      let storageId;
      try {
        const url = await mutation('uploadUrl');
        const response = await fetcher(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/pdf' },
          body: bytes,
          signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) throw unavailable();
        storageId = (await response.json()).storageId;
        if (typeof storageId !== 'string' || !storageId) throw unavailable();
        const stored = await mutation('register', { path, storageId });
        if (!stored)
          throw Object.assign(Error('Arquivo já enviado. Conclua o cadastro do PDF.'), {
            status: 409,
          });
      } catch (error) {
        if (storageId) await mutation('discard', { storageId }).catch(() => {});
        if (error.status === 409) throw error;
        throw unavailable();
      }
    },
  };
}
