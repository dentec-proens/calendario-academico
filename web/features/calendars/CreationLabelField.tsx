import { maximumLabelLength } from '#src/domain/calendar/label.ts';
import { TextField } from '../../components/ui/Field.tsx';

/** The label asked at creation, the same one the editor later renames. */
export default function CreationLabelField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="calendar-create-label">
      <TextField
        id="calendar-create-label"
        name="label"
        label="Complemento do nome"
        description="Ex.: Cursos bimestrais. Distingue este calendário dos demais do campus no mesmo ano."
        required
        maxLength={maximumLabelLength}
        value={value}
        onValueChange={(next) => onChange(String(next))}
      />
    </div>
  );
}
