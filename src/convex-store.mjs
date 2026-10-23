import { changesBetween } from './convex-diff.mjs';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { campusNames, initialCatalogue } from './institution.mjs';
import { encodeValue, decodeValue } from './convex-codec.mjs';
import { auditLog } from './audit-log.mjs';

const references = Object.fromEntries(
  ['snapshot', 'commit', 'initialize', 'importState'].map((name) => [
    name,
    makeFunctionReference('store:' + name),
  ]),
);

function cleanOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw Error('Opções de consulta inválidas.');
  encodeValue(options);
  return JSON.parse(JSON.stringify(options));
}

const seedState = () => ({
  users: [],
  campuses: campusNames.map((name, index) => ({ id: `campus-${index + 1}`, name })),
  calendars: [],
  histories: [],
  audit: [],
  catalogue: initialCatalogue(),
});

export async function openConvexStore(
  url,
  { secret, client: providedClient, seed = true, retries = 32 } = {},
) {
  if (!secret || typeof secret !== 'string') throw Error('Configure DENTEC_CONVEX_BRIDGE_SECRET.');
  if (!Number.isInteger(retries) || retries < 0) throw Error('Número de tentativas inválido.');
  const client = providedClient || new ConvexHttpClient(url);
  const snapshot = async (options) => {
    const result = await client.query(references.snapshot, { secret, options });
    const state = decodeValue(result.state);
    if (!state || typeof state !== 'object' || Array.isArray(state))
      throw Error('Estado inválido retornado pelo Convex.');
    return { ...result, state };
  };
  const store = {
    async read(options) {
      return (await snapshot(cleanOptions(options))).state;
    },
    async auditPage(user, offset = 0) {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 8_000)
        throw Object.assign(
          Error(
            'O experimento permite consultar logs até o offset 8.000. Exporte a auditoria em lotes.',
          ),
          { status: 400 },
        );
      const result = await client.query(makeFunctionReference('audit:page'), {
        secret,
        role: user.role,
        campusId: user.campusId || null,
        offset,
      });
      return {
        entries: auditLog(decodeValue(result.state), user).entries,
        nextOffset: result.hasMore ? offset + 100 : null,
      };
    },
    exportState: () => store.read({ full: true }),
    async importState(state) {
      if (!state || typeof state !== 'object' || Array.isArray(state))
        throw Error('Documento de importação inválido.');
      await client.mutation(references.importState, { secret, state: encodeValue(state) });
      return store.exportState();
    },
    async change(fn, requested = {}) {
      const options = cleanOptions(requested);
      for (let attempt = 0; attempt <= retries; attempt++) {
        const { state: before, keys, tokens } = await snapshot(options),
          next = structuredClone(before),
          result = await fn(next),
          changes = changesBetween(before, next, keys || {}, options);
        if (!changes.length) return result;
        const committed = await client.mutation(references.commit, {
          secret,
          options,
          tokens,
          changes,
        });
        if (committed.committed) return result;
        if (attempt < retries)
          await new Promise((resolve) => setTimeout(resolve, 2 + Math.floor(Math.random() * 12)));
      }
      throw Object.assign(Error('Os dados foram alterados em outra sessão. Tente novamente.'), {
        code: 'DENTEC_CONFLICT',
        status: 409,
      });
    },
    close: async () => {},
  };
  if (seed)
    await client.mutation(references.initialize, { secret, state: encodeValue(seedState()) });
  return store;
}
