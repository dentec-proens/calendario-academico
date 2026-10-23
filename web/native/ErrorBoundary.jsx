import { Component } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { nativeError } from './client.js';

function AccessError({ error }) {
  const { signOut } = useAuthActions();
  return (
    <main>
      <section className="panel">
        <h1>Não foi possível acessar o portal</h1>
        <p role="alert">{nativeError(error).message}</p>
        <div className="actions">
          <button type="button" onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              await signOut();
              window.location.replace('/');
            }}
          >
            Voltar ao login
          </button>
        </div>
      </section>
    </main>
  );
}

export default class NativeErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    return this.state.error ? <AccessError error={this.state.error} /> : this.props.children;
  }
}
