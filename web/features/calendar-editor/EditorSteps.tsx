import { Link } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { EditorSection } from '#src/app/routes.ts';
import { editorNavigation, editorSteps } from './editor-steps.ts';

export default function EditorSteps({
  calendarId,
  current,
  issueCount,
  stepCounts,
}: {
  calendarId: string;
  current: EditorSection;
  /** Open content issues, shown under the review step that lists them. */
  issueCount: number;
  /** The issues that each filling step can correct. */
  stepCounts: Partial<Record<EditorSection, number>>;
}) {
  const { active, stepIndex } = editorNavigation(current);
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 851px)');
    const update = () => {
      if (menu.current) menu.current.open = media.matches;
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return (
    <aside className="editor-sidebar">
      <details ref={menu} className="editor-step-menu" open>
        <summary>
          <span>
            {active
              ? `Etapa ${stepIndex + 1} de ${editorSteps.length} · ${active.title}`
              : 'Etapas de elaboração'}
          </span>
          <ChevronDown aria-hidden="true" />
        </summary>
        <p className="editor-guide-title">Elabore seu calendário</p>
        <nav
          aria-label="Seções do editor"
          onClick={(event) => {
            if (
              (event.target as HTMLElement).closest('a') &&
              !window.matchMedia('(min-width: 851px)').matches &&
              menu.current
            ) {
              menu.current.open = false;
              if ((event.target as HTMLElement).closest('[aria-current="page"]'))
                menu.current.querySelector('summary')?.focus();
            }
          }}
        >
          {editorSteps.map((step, index) => {
            const count = step.section === 'issues' ? issueCount : (stepCounts[step.section] ?? 0);
            return (
              <div
                className={`editor-step-group ${step.section === active?.section ? 'is-current' : ''}`}
                key={step.section}
              >
                <Link
                  to={step.path}
                  params={{ calendarId }}
                  search={(previous) => previous}
                  className="editor-step"
                  data-view={step.section}
                  aria-current={active?.section === step.section ? 'page' : undefined}
                >
                  <span className="editor-step-number">{index + 1}</span>
                  <span className="editor-step-text">
                    <span className="editor-step-title">{step.title}</span>
                    {count > 0 && (
                      <span className="editor-step-note" data-issue-count={count}>
                        {count} {count === 1 ? 'pendência' : 'pendências'}
                      </span>
                    )}
                  </span>
                </Link>
              </div>
            );
          })}
        </nav>
      </details>
    </aside>
  );
}
