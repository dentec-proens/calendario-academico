import { Button as BaseButton } from '@base-ui/react/button';
import type { ComponentProps } from 'react';

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, 'className'> & {
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger';
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <BaseButton {...props} type={type} className={`ui-button ui-button--${variant} ${className}`} />
  );
}
