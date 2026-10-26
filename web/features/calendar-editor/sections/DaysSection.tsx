import SaturdaysForm from '../forms/SaturdaysForm.tsx';

export default function DaysSection() {
  return (
    <section id="days" className="view">
      <div className="panel">
        <h3>Sábados letivos do ano</h3>
        <p className="help">
          Selecione as datas na grade anual e informe uma atividade e uma fonte da decisão para cada
          sábado. Datas que coincidem com impedimentos mostram o motivo na própria grade.
        </p>
        <SaturdaysForm />
      </div>
    </section>
  );
}
