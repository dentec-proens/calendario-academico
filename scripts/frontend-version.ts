import { randomUUID } from 'node:crypto';
import type { Plugin } from 'vite';

/** One identity per build invocation, including direct Vite builds. */
export function frontendVersion(): Plugin {
  let buildId: string;
  return {
    name: 'portal-frontend-version',
    config(_config, environment) {
      buildId = environment.command === 'build' ? randomUUID() : '';
      return { define: { __PORTAL_BUILD_ID__: JSON.stringify(buildId) } };
    },
    generateBundle(_options, bundle) {
      if (!buildId) throw new Error('Missing frontend build identity');
      const encoded = JSON.stringify({ schemaVersion: 1, buildId });
      if (
        !Object.values(bundle).some((item) => item.type === 'chunk' && item.code.includes(buildId))
      )
        throw new Error('Client is missing the frontend build identity');
      if (bundle['version.json']) throw new Error('Duplicate frontend manifest');
      this.emitFile({ type: 'asset', fileName: 'version.json', source: encoded });
    },
  };
}
