import { useRef, type ReactNode } from 'react';
import { Copy, X } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { useAction } from '../../shared/forms/useAction.ts';
import type { Notify } from '../../shared/convex/types.ts';

export default function PrivateLink({
  id,
  title,
  children,
  url,
  onClose,
  notify,
}: {
  id: string;
  title: string;
  children: ReactNode;
  url: string;
  onClose: () => void;
  notify: Notify;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { pending, run } = useAction(notify);
  return (
    <div id={id} className="panel private-link">
      <h3>{title}</h3>
      {children}
      <label>
        Link privado
        <input
          id={id === 'invite-result' ? 'invite-url' : 'recovery-link'}
          ref={inputRef}
          value={url}
          readOnly
          autoComplete="off"
        />
      </label>
      <div className="actions">
        <Button
          type="button"
          id={id === 'invite-result' ? 'copy-invite' : 'copy-recovery'}
          disabled={pending}
          onClick={() =>
            run(async () => {
              try {
                await navigator.clipboard.writeText(url);
                notify('Link copiado.');
              } catch {
                inputRef.current?.select();
                notify('Selecione o link e use Ctrl+C.');
              }
            })
          }
        >
          <Copy aria-hidden="true" size={18} />
          Copiar link
        </Button>
        <Button
          type="button"
          variant="secondary"
          id={id === 'invite-result' ? 'close-invite' : 'close-recovery'}
          onClick={onClose}
        >
          <X aria-hidden="true" size={18} />
          Fechar
        </Button>
      </div>
    </div>
  );
}
