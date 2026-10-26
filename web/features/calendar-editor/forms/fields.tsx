import type { AnyFieldApi } from '@tanstack/react-form';
import type { ComponentProps, ReactNode } from 'react';

export function Input({
  field,
  label,
  ...props
}: { field: AnyFieldApi; label: ReactNode } & Omit<
  ComponentProps<'input'>,
  'onChange' | 'value' | 'name'
>) {
  const errors = field.state.meta.isTouched ? field.state.meta.errors : [];
  return (
    <label>
      {label}
      <input
        {...props}
        name={field.name}
        value={String(field.state.value ?? '')}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={errors.length ? true : undefined}
      />
      {errors.length > 0 && <small role="alert">{errors.map(String).join('. ')}</small>}
    </label>
  );
}

export function Check({
  field,
  label,
  ...props
}: { field: AnyFieldApi; label: ReactNode } & Omit<
  ComponentProps<'input'>,
  'onChange' | 'checked' | 'type' | 'name'
>) {
  return (
    <label className="check">
      <input
        {...props}
        name={field.name}
        type="checkbox"
        checked={Boolean(field.state.value)}
        onChange={(event) => field.handleChange(event.target.checked)}
        onBlur={field.handleBlur}
      />
      {label}
    </label>
  );
}

export function Select({
  field,
  label,
  children,
  ...props
}: { field: AnyFieldApi; label: ReactNode; children: ReactNode } & Omit<
  ComponentProps<'select'>,
  'onChange' | 'value' | 'name'
>) {
  return (
    <label>
      {label}
      <select
        {...props}
        name={field.name}
        value={String(field.state.value ?? '')}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
      >
        {children}
      </select>
    </label>
  );
}
