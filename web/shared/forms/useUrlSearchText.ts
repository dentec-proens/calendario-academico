import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeatureRoute } from '../../app/navigation.ts';

const settleDelay = 300;

/**
 * Search text kept in `busca`. The box follows the typing right away and the URL follows once it
 * settles, so typing does not add a server query per letter or race the router's asynchronous
 * update. Only a value this hook did not write, such as Back or a cleared filter, replaces the box.
 * Never use it for text that may hold personal data: the URL ends up in history and logs.
 */
export function useUrlSearchText() {
  const { busca } = useFeatureRoute();
  const navigate = useNavigate();
  const [text, setText] = useState(busca);
  const written = useRef(busca);
  useEffect(() => {
    if (busca === written.current) return;
    written.current = busca;
    setText(busca);
  }, [busca]);
  useEffect(() => {
    if (text === written.current) return;
    const timer = setTimeout(() => {
      written.current = text;
      void navigate({
        to: '.',
        search: (previous) => ({ ...previous, busca: text.trim() ? text : undefined }),
        replace: true,
      });
    }, settleDelay);
    return () => clearTimeout(timer);
  }, [navigate, text]);
  /** Empties the box when the caller's own navigation removes `busca`. */
  const reset = useCallback(() => {
    written.current = '';
    setText('');
  }, []);
  return { text, setText, reset };
}
