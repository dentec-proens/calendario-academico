import { lazy, useState, type ComponentType } from 'react';
import { CatchBoundary } from '@tanstack/react-router';
import { Button } from '../components/ui/Button.tsx';
import { Notice } from '../components/ui/Notice.tsx';

export class ChunkLoadError extends Error {
  constructor(cause: unknown) {
    super('Não foi possível carregar os arquivos desta página.', { cause });
    this.name = 'ChunkLoadError';
  }
}

/** No reload and no cache-busting: a new lazy resource retries the original import URL. */
export function controlledLazy<T extends object>(
  load: () => Promise<{ default: ComponentType<T> }>,
) {
  let failedStylesheet: string | undefined;
  const resource = () =>
    lazy(async () => {
      try {
        if (failedStylesheet) {
          await retryStylesheet(failedStylesheet);
          failedStylesheet = undefined;
        }
        return await load();
      } catch (cause) {
        if (cause instanceof Error && cause.message.startsWith('Unable to preload CSS for '))
          failedStylesheet = cause.message.slice('Unable to preload CSS for '.length);
        throw new ChunkLoadError(cause);
      }
    });
  let initial = resource();
  return function ControlledPage(props: T) {
    const [attempt, setAttempt] = useState(() => ({ Component: initial, number: 0 }));
    const Component = attempt.Component;
    return (
      <CatchBoundary
        getResetKey={() => attempt.number}
        errorComponent={({ error }) => (
          <section className="panel">
            <h2>Não foi possível abrir esta página</h2>
            <Notice tone="warning" announce="assertive">
              {error instanceof ChunkLoadError
                ? 'Falha ao carregar os arquivos. Seu trabalho permanece nesta aba. Verifique a conexão e tente novamente; se a falha persistir, resolva os preenchimentos antes de atualizar o portal.'
                : 'Ocorreu um erro nesta tela. Use os controles de recuperação para continuar.'}
            </Notice>
            <Button
              type="button"
              onClick={() => {
                if (error instanceof ChunkLoadError)
                  window.dispatchEvent(new Event('portal:chunk-error'));
                initial = resource();
                setAttempt((current) => ({ Component: initial, number: current.number + 1 }));
              }}
            >
              Tentar novamente
            </Button>
          </section>
        )}
        onCatch={(error) => {
          if (error instanceof ChunkLoadError)
            window.dispatchEvent(new Event('portal:chunk-error'));
        }}
      >
        <Component {...props} />
      </CatchBoundary>
    );
  };
}

/** Vite remembers failed CSS preloads. Retry that exact same-origin asset before JS. */
function retryStylesheet(href: string) {
  const url = new URL(href, window.location.origin);
  if (
    url.origin !== window.location.origin ||
    !url.pathname.startsWith('/assets/') ||
    !url.pathname.endsWith('.css')
  )
    return Promise.reject(new Error('Não foi possível recuperar o estilo da página.'));
  return new Promise<void>((resolve, reject) => {
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
      if (link.href === url.href && !link.sheet) link.remove();
    });
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url.href;
    link.onload = () => resolve();
    link.onerror = () => {
      link.remove();
      reject(new Error('Não foi possível recuperar o estilo da página.'));
    };
    document.head.append(link);
  });
}
