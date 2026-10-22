import { createClient } from '@supabase/supabase-js';
import { retryingResource } from './retrying-resource.mjs';

const check = (result) => {
  if (result.error)
    throw Object.assign(Error('Armazenamento indisponível. Tente novamente.'), { status: 503 });
  return result.data;
};

export async function cloudFiles(url, key, { client: providedClient } = {}) {
  const client =
      providedClient ||
      createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    bucket = 'dentec-private';
  // PDF availability must not block login, calendar editing or saving. Still
  // validate privacy before every storage operation, with retry after failures.
  const ready = retryingResource(async () => {
    let existing = await client.storage.getBucket(bucket);
    if (existing.error && String(existing.error.statusCode) === '404') {
      const created = await client.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: 8_000_000,
        allowedMimeTypes: ['application/pdf'],
      });
      if (created.error) check(created);
      existing = await client.storage.getBucket(bucket);
    }
    const actual = check(existing);
    if (actual.public)
      throw Object.assign(Error('O armazenamento documental precisa ser privado.'), {
        status: 503,
      });
  });
  const files = client.storage.from(bucket);
  return {
    uploadUrl: async (path) => {
      await ready();
      return check(await files.createSignedUploadUrl(path, { upsert: false })).signedUrl;
    },
    async read(path) {
      await ready();
      const blob = check(await files.download(path));
      if (blob.size > 8_000_000)
        throw Object.assign(Error('Arquivo maior que 8 MB.'), { status: 400 });
      return Buffer.from(await blob.arrayBuffer());
    },
    async write(path, bytes) {
      await ready();
      check(await files.upload(path, bytes, { contentType: 'application/pdf', upsert: false }));
    },
    signed: async (path, filename) => {
      await ready();
      return check(await files.createSignedUrl(path, 60, { download: filename })).signedUrl;
    },
  };
}
