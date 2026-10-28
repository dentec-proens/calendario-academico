import { Suspense, useEffect, useRef, useState } from 'react';
import { controlledLazy as lazy } from '../../../app/controlled-lazy.tsx';
import { useAppSession } from '../../../app/session.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';
import { scrollIntoView } from '../../../scroll.ts';

const AccessPage = lazy(() => import('../../access/AccessPage.tsx'));

/** Keep recovery in this tab so the editor and unfinished fields retain their owners. */
export default function EditorAccessNotice() {
  const { editorRecovery, maintenance } = useAppSession();
  const [login, setLogin] = useState(false);
  const checking = editorRecovery?.checkingIdentity;
  const notice = useRef<HTMLElement>(null);
  useEffect(() => {
    const title = notice.current?.querySelector<HTMLElement>('#editor-access-title');
    title?.focus({ preventScroll: true });
    scrollIntoView(title, { block: 'start' });
  }, [maintenance, checking]);
  return (
    <section ref={notice} id="editor-access-notice" aria-labelledby="editor-access-title">
      <Notice
        tone="warning"
        announce="assertive"
        title={
          maintenance
            ? 'Portal em manutenção'
            : checking
              ? 'Verificando seu acesso'
              : 'Entre novamente para continuar'
        }
        titleAs="h2"
        titleProps={{ id: 'editor-access-title', tabIndex: -1 }}
        actions={
          !maintenance && !checking ? (
            <button type="button" id="expired-editor-login" onClick={() => setLogin(true)}>
              Entrar novamente
            </button>
          ) : undefined
        }
      >
        {maintenance ? (
          <>
            <p>
              O preenchimento está pausado enquanto fazemos uma manutenção. Mantenha esta aba aberta
              para preservar suas alterações e aguarde a liberação do acesso.
            </p>
            <p>Não feche nem atualize esta página.</p>
          </>
        ) : (
          <>
            <p>
              {checking
                ? 'Aguarde enquanto verificamos seu acesso.'
                : 'Seu acesso foi interrompido. Para continuar de onde parou, entre novamente com a mesma conta.'}
            </p>
            <p>Mantenha esta aba aberta para preservar suas alterações.</p>
          </>
        )}
      </Notice>
      {login && !maintenance && !checking && (
        <Suspense fallback={<p role="status">Carregando acesso…</p>}>
          <AccessPage />
        </Suspense>
      )}
    </section>
  );
}
