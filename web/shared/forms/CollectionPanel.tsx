import { scrollIntoView } from '../../scroll.ts';
import { Button } from '../../components/ui/Button.tsx';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';

interface CollectionPanelProps {
  title: string;
  actionLabel: string;
  formTitle: string;
  formOpen: boolean;
  onFormOpen: (open: boolean) => void;
  busy?: boolean;
  canCreate?: boolean;
  actionVariant?: 'primary' | 'secondary';
  children: ReactNode;
  form: ReactNode;
  feedback?: ReactNode;
}

export default function CollectionPanel({
  title,
  actionLabel,
  formTitle,
  formOpen,
  onFormOpen,
  busy = false,
  canCreate = true,
  actionVariant = 'primary',
  children,
  form,
  feedback,
}: CollectionPanelProps) {
  const id = useId();
  const listHeading = useRef<HTMLHeadingElement>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const previousOpen = useRef(false);

  function changeView(open: boolean) {
    onFormOpen(open);
  }

  useEffect(() => {
    if (previousOpen.current === formOpen) return;
    previousOpen.current = formOpen;
    if (!formOpen) return;
    const frame = requestAnimationFrame(() => {
      const heading = formHeading.current;
      heading?.focus({ preventScroll: true });
      scrollIntoView(heading, { block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [formOpen]);

  return (
    <>
      {feedback}
      {!formOpen ? (
        <div className="panel collection-list">
          <div className="collection-heading">
            <h2 ref={listHeading} tabIndex={-1}>
              {title}
            </h2>
            {canCreate ? (
              <Button
                variant={actionVariant}
                type="button"
                aria-controls={id}
                disabled={busy}
                onClick={() => changeView(true)}
              >
                <Plus size={18} aria-hidden="true" /> {actionLabel}
              </Button>
            ) : null}
          </div>
          {children}
        </div>
      ) : canCreate ? (
        <div id={id} className="panel collection-form">
          <Button
            type="button"
            variant="secondary"
            className="collection-back"
            disabled={busy}
            onClick={() => changeView(false)}
          >
            <ArrowLeft size={18} aria-hidden="true" /> Voltar à lista
          </Button>
          <h2 ref={formHeading} tabIndex={-1}>
            {formTitle}
          </h2>
          {form}
        </div>
      ) : null}
    </>
  );
}
