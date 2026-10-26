import type { HTMLAttributes, ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

const icons: Record<NoticeTone, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

type NoticeProps = Omit<HTMLAttributes<HTMLElement>, 'title' | 'role'> & {
  /** Meaning of the message; the text must convey it too, never the color alone. */
  tone?: NoticeTone;
  title?: ReactNode;
  /** A heading joins the page outline; `strong` keeps the title out of it. */
  titleAs?: 'strong' | 'h2' | 'h3' | 'h4' | 'h5';
  /** Identity of the title, such as an id for `aria-labelledby` or a focus target. */
  titleProps?: HTMLAttributes<HTMLElement>;
  /** Replaces the tone's icon; `null` shows none. */
  icon?: LucideIcon | null;
  /** Buttons or links that resolve the notice. */
  actions?: ReactNode;
  /**
   * Announces the notice when it appears or changes: `polite` as a status, `assertive` as an
   * alert. Notices that are part of the page stay silent so they are not read on every render.
   */
  announce?: 'polite' | 'assertive';
  /** `section` with `aria-labelledby` makes the notice a named region. */
  as?: 'div' | 'section';
};

export function Notice({
  tone = 'info',
  title,
  titleAs: Title = 'strong',
  titleProps,
  icon,
  actions,
  announce,
  as: Element = 'div',
  className,
  children,
  ...props
}: NoticeProps) {
  const Icon = icon === undefined ? icons[tone] : icon;
  return (
    <Element
      {...props}
      className={['ui-notice', `ui-notice--${tone}`, className].filter(Boolean).join(' ')}
      data-tone={tone}
      role={announce === 'assertive' ? 'alert' : announce === 'polite' ? 'status' : undefined}
    >
      {Icon ? <Icon className="ui-notice__icon" size={20} aria-hidden="true" /> : null}
      <div className="ui-notice__body">
        {title ? (
          <Title {...titleProps} className="ui-notice__title">
            {title}
          </Title>
        ) : null}
        {children ? <div className="ui-notice__content">{children}</div> : null}
        {actions ? <div className="ui-notice__actions">{actions}</div> : null}
      </div>
    </Element>
  );
}
