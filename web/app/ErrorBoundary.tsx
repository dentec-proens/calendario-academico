import { Button } from '../components/ui/Button.tsx';
import { Component, useState, type PropsWithChildren } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { nativeError } from '../shared/convex/errors.ts';
import { Notice } from '../components/ui/Notice.tsx';

function AccessError({ error }: { error: unknown }) {
  const { signOut } = useAuthActions();
  const [logoutError, setLogoutError] = useState('');

  async function backToLogin() {
    try {
      await signOut();
      window.location.replace('/');
    } catch (failure) {
      setLogoutError(nativeError(failure).message);
    }
  }
  return (
    <main>
      <section className="panel">
        <h1>Não foi possível acessar o portal</h1>
        <Notice tone="danger" announce="assertive">
          {logoutError || nativeError(error).message}
        </Notice>
        <div className="actions">
          <Button type="button" onClick={() => window.location.reload()}>
            Tentar novamente
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void backToLogin();
            }}
          >
            Voltar ao login
          </Button>
        </div>
      </section>
    </main>
  );
}

interface ErrorState {
  error: Error | null;
}

export default class ApplicationErrorBoundary extends Component<PropsWithChildren, ErrorState> {
  override state: ErrorState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorState {
    return { error: nativeError(error) };
  }

  override render() {
    return this.state.error ? <AccessError error={this.state.error} /> : this.props.children;
  }
}
