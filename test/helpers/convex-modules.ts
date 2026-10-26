/// <reference types="vite/client" />

export const convexModules = {
  '../../convex/_generated/server.js': () => import('../../convex/_generated/server.js'),
  ...import.meta.glob(['../../convex/**/*.ts', '!../../convex/_generated/**']),
};
