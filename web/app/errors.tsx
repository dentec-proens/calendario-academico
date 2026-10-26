import { Link, useRouter } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { Button } from '../components/ui/Button.tsx';
import { nativeError } from '../shared/convex/errors.ts';
import { Notice } from '../components/ui/Notice.tsx';

export function NotFoundPage() {
  return (
    <section className="panel">
      <h1 tabIndex={-1}>Página não encontrada</h1>
      <p>Confira o endereço ou volte aos calendários.</p>
      <Link to="/calendarios">Voltar aos calendários</Link>
    </section>
  );
}

export function ApplicationError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <section className="panel">
      <h1>Não foi possível abrir esta página</h1>
      <Notice tone="danger" announce="assertive">
        {nativeError(error).message}
      </Notice>
      <Button
        type="button"
        onClick={() => {
          reset();
          void router.invalidate();
        }}
      >
        Tentar novamente
      </Button>
    </section>
  );
}
