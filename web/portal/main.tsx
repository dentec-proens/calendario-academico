import { createRoot } from 'react-dom/client';
import '../style.css';
import '../portal.css';
import './react-portal.css';
import NativeProvider from '../native/Provider.tsx';
import NativeApp from '../native/App.tsx';
import NativeErrorBoundary from '../native/ErrorBoundary.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('O portal precisa do elemento raiz.');

createRoot(root).render(
  <NativeProvider>
    <NativeErrorBoundary>
      <NativeApp />
    </NativeErrorBoundary>
  </NativeProvider>,
);
