import { useId, type ReactNode } from 'react';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Radio } from '@base-ui/react/radio';

interface ChoiceGroupProps<Value extends string> {
  label: string;
  value: Value | null;
  options: ReadonlyArray<{ value: Value; label: ReactNode }>;
  disabled?: boolean;
  onValueChange: (value: Value) => void;
}

export function ChoiceGroup<Value extends string>({
  label,
  value,
  options,
  disabled,
  onValueChange,
}: ChoiceGroupProps<Value>) {
  const id = useId();
  return (
    <div className="ui-choice-field">
      <p id={id} className="ui-field__label">
        {label}
      </p>
      <RadioGroup<Value | null>
        className="ui-choice-group"
        aria-labelledby={id}
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
