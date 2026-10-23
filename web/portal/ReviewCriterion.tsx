import { CheckCheck } from 'lucide-react';
import type { reviews } from '../native/client.ts';
import { Button } from '../components/ui/Button.tsx';
import { ChoiceGroup } from '../components/ui/ChoiceGroup.tsx';
import { TextAreaField } from '../components/ui/Field.tsx';
import { Notice, StatusBadge } from '../components/ui/Feedback.tsx';

type Criterion = Awaited<ReturnType<typeof reviews.get>>['criteria'][number];
type Entry = Parameters<typeof reviews.save>[1]['entries'][number];

const assessmentOptions = [
  { value: 'ATENDIDO', label: 'Atendido' },
  { value: 'NAO_ATENDIDO', label: 'Não atendido' },
  { value: 'NAO_APLICAVEL', label: 'Não aplicável' },
] as const;

export default function ReviewCriterion({
  criterion,
  entry,
  changed,
  saved,
  busy,
  onChange,
  onConfirm,
}: {
  criterion: Criterion;
  entry: Entry;
  changed: boolean;
  saved: boolean;
  busy: boolean;
  onChange: <K extends 'status' | 'notes'>(field: K, value: Entry[K]) => void;
  onConfirm: () => void;
}) {
  const pending = entry.status === 'PENDENTE';
  const origin = entry.reviewed
    ? changed
      ? 'Conferido · por salvar'
      : 'Conferido e salvo'
    : changed
      ? 'Alteração não confirmada'
      : pending
        ? 'Pendente de conferência'
        : saved
          ? 'Avaliação salva · não confirmada'
          : 'Sugestão automática · não conferida';
  const signal = (criterion.signal ?? '')
    .replace(' A presença não comprova atendimento.', '')
    .replace(' Isso não comprova ausência no processo.', '');
  const unavailableCount = signal.startsWith('Contagem indisponível:');
  const hint = entry.reviewed
    ? changed
      ? 'Salve a análise para registrar esta conferência.'
      : 'Se alterar a avaliação ou as observações, confirme novamente.'
    : pending
      ? 'Selecione uma avaliação para confirmar.'
      : 'Confira as evidências antes de confirmar sua avaliação.';

  return (
    <li className="review-item" aria-labelledby={`criterion-title-${criterion.id}`}>
      <div className="review-item__heading">
        <h3 id={`criterion-title-${criterion.id}`}>{criterion.title}</h3>
        <StatusBadge
          tone={entry.reviewed ? 'success' : changed ? 'warning' : 'neutral'}
          data-origin={criterion.id}
        >
          {origin}
        </StatusBadge>
      </div>
      <Notice
        title={unavailableCount ? 'Contagem automática indisponível' : 'Indicação do sistema'}
      >
        {unavailableCount
          ? `${signal.replace('Contagem indisponível: ', '')}. Confira os documentos para avaliar este critério.`
          : signal}
      </Notice>
      {criterion.candidates.length > 0 ? (
        <details>
          <summary>
            Ver registros possivelmente relacionados ({criterion.candidates.length})
          </summary>
          <ul>
            {criterion.candidates.map((candidate, index) => (
              <li key={candidate.id || index}>
                {candidate.start} a {candidate.end} · {candidate.name}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div data-fields={criterion.id}>
        <ChoiceGroup
          label="Sua avaliação"
          value={pending ? null : entry.status}
          options={assessmentOptions}
          disabled={busy}
          onValueChange={(value) => onChange('status', value)}
        />
        <TextAreaField
          label="Observações (opcional)"
          data-notes={criterion.id}
          disabled={busy}
          maxLength={2000}
          rows={2}
          placeholder="Registre a evidência, o ajuste ou a orientação ao campus."
          value={entry.notes}
          onValueChange={(value) => onChange('notes', value)}
        />
      </div>
      <div className="review-item__footer">
        <p id={`criterion-hint-${criterion.id}`} className="review-item__hint" role="status">
          {hint}
        </p>
        <div className="review-item__actions">
          {!pending ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => onChange('status', 'PENDENTE')}
            >
              Deixar pendente
            </Button>
          ) : null}
          <Button
            data-confirm-criterion={criterion.id}
            aria-describedby={`criterion-hint-${criterion.id}`}
            disabled={busy || pending || entry.reviewed}
            onClick={onConfirm}
          >
            <CheckCheck size={16} aria-hidden="true" />{' '}
            {entry.reviewed ? 'Conferência confirmada' : 'Confirmar conferência'}
          </Button>
        </div>
      </div>
    </li>
  );
}
