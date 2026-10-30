import { useEffect, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { institution } from '../../shared/convex/institution.ts';
import { nativeError } from '../../shared/convex/errors.ts';
import { Button } from '../../components/ui/Button.tsx';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator.tsx';
import { Notice } from '../../components/ui/Notice.tsx';

export default function OpenDocumentPage() {
  const { documentId } = useParams({ from: '/_authenticated/documentos/$documentId/abrir' });
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void institution.openDocument(documentId).then(
      ({ url }) => {
        if (active) window.location.replace(url);
      },
      (cause: unknown) => {
        if (active) setError(nativeError(cause).message);
      },
    );
    return () => {
      active = false;
    };
  }, [documentId, attempt]);
  return (
    <section className="panel">
      <h1>Abrir documento</h1>
      {error ? (
        <>
          <Notice tone="danger" announce="assertive">
            {error}
          </Notice>
          <Button
            onClick={() => {
              setError('');
              setAttempt((value) => value + 1);
            }}
          >
            Tentar novamente
          </Button>
        </>
      ) : (
        <LoadingIndicator label="Abrindo PDF…" />
      )}
    </section>
  );
}
