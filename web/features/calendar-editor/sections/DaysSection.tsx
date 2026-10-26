import SaturdaysForm from '../saturdays/SaturdaysForm.tsx';

export default function DaysSection() {
  return (
    <section id="days" className="view">
      <div className="panel">
        <h3>Sábados letivos do ano</h3>
        <p className="help">
          Selecione sábados no calendário e informe a atividade e a fonte no painel; clique em um
          sábado registrado para editá-lo.
        </p>
        <SaturdaysForm />
      </div>
    </section>
  );
}
