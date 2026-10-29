import { Button as BaseButton } from '@base-ui/react/button';
import type { ComponentProps } from 'react';
import { LoadingIndicator } from './LoadingIndicator.tsx';

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, 'className'> & {
  className?: string;
  pending?: boolean;
  loadingLabel?: string;
  variant?: 'primary' | 'secondary' | 'danger';
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  pending = false,
  loadingLabel,
  children,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      {...props}
      type={type}
      disabled={pending || props.disabled}
      aria-busy={pending || props['aria-busy']}
      className={`ui-button ui-button--${variant} ${pending ? 'ui-button--pending' : ''} ${className}`}
    >
      {children}
      {pending ? <LoadingIndicator layout="action" label={loadingLabel} /> : null}
    </BaseButton>
  );
}
