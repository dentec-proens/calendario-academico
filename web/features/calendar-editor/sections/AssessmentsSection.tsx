import AssessmentSettingsForm from '../forms/AssessmentSettingsForm.tsx';
import ActivityChecklist from '../events/ActivityChecklist.tsx';

export default function AssessmentsSection() {
  return (
    <section id="assessments" className="view">
      <div className="panel" id="assessment-area">
        <h3>Organização das avaliações</h3>
        <p className="help">
          Defina as etapas de cada oferta. As avaliações de ofertas diferentes podem ocorrer
          simultaneamente.
        </p>
        <AssessmentSettingsForm />
      </div>
      <div className="panel">
        <h3>Datas das etapas</h3>
        <p className="help">
          O início da primeira etapa permite sugerir a distribuição dos demais intervalos. Confira
          as datas e a fonte da decisão antes de aplicar.
        </p>
        <ActivityChecklist stages />
      </div>
    </section>
  );
}
