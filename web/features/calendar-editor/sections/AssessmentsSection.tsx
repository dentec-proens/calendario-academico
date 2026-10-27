import AssessmentSettingsForm from '../forms/AssessmentSettingsForm.tsx';
import ActivityChecklist from '../events/ActivityChecklist.tsx';
import { useEffect, useRef } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useActivitySearch } from '../events/activity-query.ts';
import { scrollIntoView } from '../../../scroll.ts';

export default function AssessmentsSection() {
  const hash = useRouterState({ select: (state) => state.location.hash });
  const { atividade } = useActivitySearch();
  const previousHash = useRef<string | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (previousHash.current === hash) return;
    previousHash.current = hash;
    if (hash !== 'assessment-area' || atividade) return;
    const frame = requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      scrollIntoView(heading.current, { block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, atividade]);
  return (
    <section id="assessments" aria-label="Etapas de avaliação">
      <div className="panel period-section-card" id="assessment-area">
        <h3 id="assessment-heading" ref={heading} tabIndex={-1}>
          Etapas de avaliação
        </h3>
        <p className="help">
          Defina as etapas de cada oferta. As avaliações de ofertas diferentes podem ocorrer
          simultaneamente.
        </p>
        <AssessmentSettingsForm />
        <h4>Datas das etapas</h4>
        <p className="help">
          O início da primeira etapa permite sugerir a distribuição dos demais intervalos. Confira
          as datas e a fonte da decisão antes de aplicar.
        </p>
        <ActivityChecklist stages />
      </div>
    </section>
  );
}
