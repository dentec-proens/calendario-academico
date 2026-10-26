import { lazy, Suspense } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { isPrivateAccessPath } from './private-links.ts';

const Panel = import.meta.env.DEV ? lazy(() => import('./devtools-panel.tsx')) : null;

export function DevelopmentTools() {
  const location = useRouterState({ select: (state) => state.location });
  if (!Panel || isPrivateAccessPath(location.pathname) || location.search.devtools !== '1')
    return null;
  return (
    <Suspense fallback={null}>
      <Panel />
    </Suspense>
  );
}
