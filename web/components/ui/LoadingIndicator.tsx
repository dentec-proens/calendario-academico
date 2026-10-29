import { useEffect, useState } from 'react';
import './loading-indicator.css';

interface LoadingIndicatorProps {
  label?: string;
  layout?: 'block' | 'overlay' | 'action';
}

/** Shared visual and accessible feedback for indeterminate work, delayed to avoid flashing. */
export function LoadingIndicator({
  label = 'Carregando…',
  layout = 'block',
}: LoadingIndicatorProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(true), 200);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <span className={`loading-indicator loading-indicator--${layout}`} data-visible={visible}>
      <span className="loading-indicator-announcement" role="status">
        {visible ? label : ''}
      </span>
      {visible ? <span className="loading-indicator-bar" aria-hidden="true" /> : null}
    </span>
  );
}
