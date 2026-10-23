import { convexTest } from 'convex-test';
import { tsImport } from 'tsx/esm/api';
import { openConvexStore } from '../../src/convex-store.mjs';

const secret = 'isolated-convex-test-bridge-secret';

// Each fixture executes the real Convex handlers against an isolated in-memory
// database. It never reads a development deployment or the user's credentials.
export async function createConvexTestDatabase(t, { seed = true, client: providedClient } = {}) {
  process.env.DENTEC_CONVEX_BRIDGE_SECRET = secret;
  const schema = await tsImport('../../convex/schema.ts', import.meta.url);
  const client =
    providedClient ||
    convexTest(schema.default, {
      '../../convex/_generated/server.js': () => import('../../convex/_generated/server.js'),
      '../../convex/store.ts': () => tsImport('../../convex/store.ts', import.meta.url),
      '../../convex/files.ts': () => tsImport('../../convex/files.ts', import.meta.url),
      '../../convex/audit.ts': () => tsImport('../../convex/audit.ts', import.meta.url),
    });
  const open = (seed) =>
    openConvexStore('https://isolated-test.convex.cloud', { client, secret, seed });
  const store = await open(seed);
  t.after(() => store.close());
  return { store, client, reopen: () => open(false), secret };
}
