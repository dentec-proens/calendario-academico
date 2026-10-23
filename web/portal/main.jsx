import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '../style.css';
import '../portal.css';
import './react-portal.css';
import { nativeEnabled } from '../native/client.js';
import NativeProvider from '../native/Provider.jsx';
import NativeApp from '../native/App.jsx';
import NativeErrorBoundary from '../native/ErrorBoundary.jsx';

createRoot(document.getElementById('root')).render(
  nativeEnabled ? (
    <NativeProvider>
      <NativeErrorBoundary>
        <NativeApp />
      </NativeErrorBoundary>
    </NativeProvider>
  ) : (
    <App />
  ),
);
