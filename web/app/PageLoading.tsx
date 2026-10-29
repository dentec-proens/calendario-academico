import { useEffect, useState } from 'react';
import './page-loading.css';

export function PageLoading() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(true), 200);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div className="page-loading" data-visible={visible}>
      <span className="page-loading-announcement" role="status">
        {visible ? 'Carregando página…' : ''}
      </span>
      {visible ? <div className="page-loading-bar" aria-hidden="true" /> : null}
    </div>
  );
}
