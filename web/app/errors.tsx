import { Link, useRouter } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { Button } from '../components/ui/Button.tsx';
import { nativeError } from '../shared/convex/errors.ts';
import { Notice } from '../components/ui/Notice.tsx';

export function NotFoundPage() {
  return (
    <section className="panel">
      <h1 tabIndex={-1}>Página não encontrada</h1>
      <p>Confira o endereço ou volte à página inicial do seu perfil.</p>
      {/* "/" sends each profile to its own start page; a fixed list would refuse reviewers. */}
      <Link to="/">Ir para a página inicial</Link>
    </section>
  );
}

/** A record the user cannot open: removed, or of another campus. Not a failure of the system. */
export const unavailableRecord = (error: unknown) => {
  const status = nativeError(error).status;
  return status === 403 || status === 404;
};

export function UnavailablePage() {
  return (
    <section className="panel">
      <h1 tabIndex={-1}>Registro indisponível</h1>
      <p>
        Este registro não existe mais ou não está disponível para o seu perfil, por exemplo um
        calendário de outro campus. Confira o endereço ou volte à página inicial.
      </p>
      <Link to="/">Ir para a página inicial</Link>
    </section>
  );
}

export function ApplicationError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  if (unavailableRecord(error)) return <UnavailablePage />;
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
