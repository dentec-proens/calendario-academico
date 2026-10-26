import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  createBrowserHistory,
  Link,
  redirect,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router';
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import {
  pageDocument,
  parseEditorPath,
  portalPaths,
  portalCreationPaths,
  editorSections,
} from '../src/app-routes.ts';

interface ApplicationContext {
  content?: ReactNode;
  document: string;
  calendarId?: string;
}

function sameDocument(document: string | undefined) {
  return document === 'index.html' ? 'portal.html' : document;
}

function ApplicationContent() {
  const { content } = rootRoute.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (!pageDocument(pathname)) {
    return (
      <main className="panel">
        <h1>Página não encontrada</h1>
        <p>Confira o endereço ou volte aos calendários.</p>
        <AppLink href="/calendarios">Voltar aos calendários</AppLink>
      </main>
    );
  }
  return content;
}

const rootRoute = createRootRouteWithContext<ApplicationContext>()({
  component: ApplicationContent,
  beforeLoad: ({ context, location }) => {
    const targetDocument = sameDocument(pageDocument(location.pathname));
    const calendarId = parseEditorPath(location.pathname)?.id;
    // The DOM editor owns subscriptions and autosave for one record per document.
    // A document navigation retains its existing beforeunload protection.
    if (
      targetDocument &&
      (targetDocument !== sameDocument(context.document) ||
        (targetDocument === 'editor.html' && calendarId !== context.calendarId))
    ) {
      throw redirect({ href: location.href, reloadDocument: true });
    }
  },
});

const routes = [
  '/',
  ...Object.values(portalPaths),
  ...Object.values(portalCreationPaths),
  '/eventos-institucionais/$eventId/editar',
  '/revisoes/$calendarId',
  ...Object.values(editorSections).map((section) => `/calendarios/$calendarId/${section}`),
  '/logs',
  '/recuperar-senha',
  '/ativar-conta',
  '$',
].map((path) => createRoute({ getParentRoute: () => rootRoute, path }));
const routeTree = rootRoute.addChildren(routes);

function makeRouter(document: string, content?: ReactNode) {
  const history = createBrowserHistory();
  const location = new URL(window.location.href);
  if (
    pageDocument(location.pathname) &&
    location.pathname !== '/' &&
    location.pathname.endsWith('/')
  ) {
    location.pathname = location.pathname.replace(/\/+$/, '');
    history.replace(location.pathname + location.search + location.hash);
  }
  return createRouter({
    routeTree,
    history,
    context: { document, content, calendarId: parseEditorPath(location.pathname)?.id },
    defaultPreload: false,
    // Keep focus/scroll in the existing accessible portal and editor headings.
    scrollRestoration: false,
    defaultPendingMinMs: 0,
    trailingSlash: 'never',
    // NativeErrorBoundary owns the application's access and retry UI.
    disableGlobalCatchBoundary: true,
  });
}

let applicationRouter: ReturnType<typeof makeRouter> | undefined;
let stopHistory: (() => void) | undefined;

/** One router per HTML shell; DOM pages can subscribe without a React root. */
export function initializeRouter(document: string, content?: ReactNode) {
  if (!applicationRouter) {
    applicationRouter = makeRouter(document, content);
    if (content === undefined) {
      const router = applicationRouter;
      stopHistory = router.history.subscribe(() => {
        void router.load();
      });
    }
    void applicationRouter.load();
  } else if (content !== undefined) {
    stopHistory?.();
    stopHistory = undefined;
    applicationRouter.update({ context: { ...applicationRouter.options.context, content } });
  }
  return applicationRouter;
}

export function getAppRouter() {
  if (!applicationRouter) throw new Error('A navegação precisa ser inicializada.');
  return applicationRouter;
}

export function ApplicationRouter({ children, document }: PropsWithChildren<{ document: string }>) {
  return <RouterProvider router={initializeRouter(document, children)} />;
}

export function useAppLocation() {
  return useRouterState({ select: (state) => state.location });
}

function requiresDocumentNavigation(target: URL) {
  const { context } = getAppRouter().options;
  const document = sameDocument(pageDocument(target.pathname));
  return (
    target.origin !== window.location.origin ||
    Boolean(
      document &&
      (document !== sameDocument(context.document) ||
        (document === 'editor.html' &&
          parseEditorPath(target.pathname)?.id !== context.calendarId)),
    )
  );
}

export function navigateApp(
  href: string,
  options: { replace?: boolean; reloadDocument?: boolean } = {},
) {
  const target = new URL(href, window.location.href);
  return getAppRouter().navigate({
    href:
      target.origin === window.location.origin
        ? target.pathname + target.search + target.hash
        : target.href,
    ...options,
    reloadDocument: options.reloadDocument || requiresDocumentNavigation(target),
  });
}

/** Real anchors preserve browser shortcuts and still use client-side navigation. */
export function AppLink({
  href,
  reloadDocument,
  ...props
}: Omit<ComponentProps<typeof Link>, 'to'> & { href: string }) {
  return (
    <Link
      {...props}
      to={href}
      reloadDocument={
        reloadDocument || requiresDocumentNavigation(new URL(href, window.location.href))
      }
    />
  );
}
