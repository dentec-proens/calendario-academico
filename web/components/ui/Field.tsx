import { Field } from '@base-ui/react/field';
import type { ComponentProps, ReactNode } from 'react';

type FieldContent = { label: ReactNode; description?: string };
type TextFieldProps = Omit<ComponentProps<typeof Field.Control>, 'className'> & FieldContent;

export function TextField({ label, description, disabled, ...props }: TextFieldProps) {
  return (
    <Field.Root className="ui-field" disabled={disabled}>
      <Field.Label className="ui-field__label">{label}</Field.Label>
      <Field.Control {...props} className="ui-control" />
      {description ? (
        <Field.Description className="ui-field__description">{description}</Field.Description>
      ) : null}
      <Field.Error className="ui-field__error" />
    </Field.Root>
  );
}

type TextAreaFieldProps = Omit<ComponentProps<'textarea'>, 'onChange' | 'ref' | 'className'> &
  FieldContent & {
    onValueChange: (value: string) => void;
  };

export function TextAreaField({
  label,
  description,
  value,
  disabled,
  onValueChange,
  ...props
}: TextAreaFieldProps) {
  return (
    <Field.Root className="ui-field" disabled={disabled}>
      <Field.Label className="ui-field__label">{label}</Field.Label>
      <Field.Control
        render={<textarea {...props} />}
        className="ui-control"
        value={value}
        onValueChange={onValueChange}
      />
      {description ? (
        <Field.Description className="ui-field__description">{description}</Field.Description>
      ) : null}
      <Field.Error className="ui-field__error" />
    </Field.Root>
  );
}
