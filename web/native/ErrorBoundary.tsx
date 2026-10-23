import { Component, useState, type PropsWithChildren } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { nativeError } from './client.ts';

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
        <p role="alert">{logoutError || nativeError(error).message}</p>
        <div className="actions">
          <button type="button" onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              void backToLogin();
            }}
          >
            Voltar ao login
          </button>
        </div>
      </section>
    </main>
  );
}

interface ErrorState {
  error: Error | null;
}

export default class NativeErrorBoundary extends Component<PropsWithChildren, ErrorState> {
  override state: ErrorState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorState {
    return { error: nativeError(error) };
  }

  override render() {
    return this.state.error ? <AccessError error={this.state.error} /> : this.props.children;
  }
}
