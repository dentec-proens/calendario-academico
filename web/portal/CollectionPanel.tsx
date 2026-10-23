import { useId, useRef, type ReactNode } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';

interface CollectionPanelProps {
  title: string;
  actionLabel: string;
  formTitle: string;
  formOpen: boolean;
  onFormOpen: (open: boolean) => void;
  busy?: boolean;
  canCreate?: boolean;
  children: ReactNode;
  form: ReactNode;
  feedback?: ReactNode;
}

/** Keeps both views mounted so navigation never discards a form being filled. */
export default function CollectionPanel({
  title,
  actionLabel,
  formTitle,
  formOpen,
  onFormOpen,
  busy = false,
  canCreate = true,
  children,
  form,
  feedback,
}: CollectionPanelProps) {
  const id = useId();
  const listHeading = useRef<HTMLHeadingElement>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);

  function changeView(open: boolean) {
    onFormOpen(open);
    requestAnimationFrame(() => {
      const heading = open ? formHeading.current : listHeading.current;
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: 'start' });
    });
  }

  return (
    <>
      {feedback}
      <div className="panel collection-list" hidden={formOpen}>
        <div className="collection-heading">
          <h2 ref={listHeading} tabIndex={-1}>
            {title}
          </h2>
          {canCreate ? (
            <button
              type="button"
              aria-controls={id}
              disabled={busy}
              onClick={() => changeView(true)}
            >
              <Plus size={18} aria-hidden="true" /> {actionLabel}
            </button>
          ) : null}
        </div>
        {children}
      </div>
      {canCreate ? (
        <div id={id} className="panel collection-form" hidden={!formOpen}>
          <button
            type="button"
            className="secondary collection-back"
            disabled={busy}
            onClick={() => changeView(false)}
          >
            <ArrowLeft size={18} aria-hidden="true" /> Voltar à lista
          </button>
          <h2 ref={formHeading} tabIndex={-1}>
            {formTitle}
          </h2>
          {form}
        </div>
      ) : null}
    </>
  );
}
