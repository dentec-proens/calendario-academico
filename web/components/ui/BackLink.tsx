import {
  Link,
  type AnyRouter,
  type LinkComponentProps,
  type RegisteredRouter,
} from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

type BackLinkProps<
  TRouter extends AnyRouter,
  TFrom extends string,
  TTo extends string | undefined,
> = LinkComponentProps<'a', TRouter, TFrom, TTo> & {
  className?: string;
  children: string;
};

/** Returns to the parent page; the label names the destination, as in the portal navigation. */
export function BackLink<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
>({ className = '', children, ...props }: BackLinkProps<TRouter, TFrom, TTo>) {
  return (
    <nav className={`ui-back-nav ${className}`} aria-label="Trilha de navegação">
      <Link {...(props as LinkComponentProps<'a'>)} className="ui-back-link">
        <ArrowLeft aria-hidden="true" size={16} /> {children}
      </Link>
    </nav>
  );
}
