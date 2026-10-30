import { useId, type CSSProperties, type ReactNode } from 'react';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Radio } from '@base-ui/react/radio';

interface ChoiceGroupProps<Value extends string> {
  label: ReactNode;
  value: Value | null;
  options: ReadonlyArray<{ value: Value; label: ReactNode }>;
  disabled?: boolean;
  /** Identifies the radio group, so validation can reveal it like a native field. */
  id?: string;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  onValueChange: (value: Value) => void;
}

/** Focus target for a field id: the field itself, or the selected (or first) choice of a group. */
export function focusableField(id: string) {
  const element = document.getElementById(id);
  if (element?.getAttribute('role') !== 'radiogroup') return element;
  return (
    element.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ??
    element.querySelector<HTMLElement>('[role="radio"]')
  );
}

export function ChoiceGroup<Value extends string>({
  label,
  value,
  options,
  disabled,
  id,
  className,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  onValueChange,
}: ChoiceGroupProps<Value>) {
  const labelId = useId();
  return (
    <div className={className ? `ui-choice-field ${className}` : 'ui-choice-field'}>
      <p id={labelId} className="ui-field__label">
        {label}
      </p>
      <RadioGroup<Value | null>
        id={id}
        className="ui-choice-group"
        style={{ '--ui-choice-count': options.length } as CSSProperties}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next !== null) onValueChange(next);
        }}
      >
        {options.map((option) => (
          <label key={option.value} className="ui-choice">
            <Radio.Root
              value={option.value}
              className="ui-choice__radio"
              data-choice={option.value}
            >
              <Radio.Indicator className="ui-choice__indicator" />
            </Radio.Root>
            <span>{option.label}</span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
