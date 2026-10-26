import type { HTMLAttributes, ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

const icons: Record<NoticeTone, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

type NoticeProps = Omit<
  HTMLAttributes<HTMLElement>,
  'title' | 'role' | 'aria-live' | 'aria-atomic'
> & {
  /** Meaning of the message; the text must convey it too, never the color alone. */
  tone?: NoticeTone;
  title?: ReactNode;
  /** A heading joins the page outline; `strong` keeps the title out of it. */
  titleAs?: 'strong' | 'h2' | 'h3' | 'h4' | 'h5';
  /** Identity of the title: an id for `aria-labelledby`, or a focus target. */
  titleProps?: Pick<HTMLAttributes<HTMLElement>, 'id' | 'tabIndex'>;
  /** Replaces the tone's icon; `null` shows none. */
  icon?: LucideIcon | null;
  /** Buttons or links that resolve the notice. */
  actions?: ReactNode;
  /**
   * Makes the notice a live region: `polite` as a status, `assertive` as an alert. Screen readers
   * may skip a polite region inserted together with its text; for transient messages keep an
   * always-mounted live wrapper and render a silent notice inside it, as `#message` does.
   */
  announce?: 'polite' | 'assertive';
  /** Raised above the page, for notices that stay fixed while it scrolls. */
  elevated?: boolean;
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
  elevated = false,
  as: Root = 'div',
  className,
  children,
  ...props
}: NoticeProps) {
  const Icon = icon === undefined ? icons[tone] : icon;
  return (
    <Root
      {...props}
      className={['ui-notice', `ui-notice--${tone}`, elevated && 'ui-notice--elevated', className]
        .filter(Boolean)
        .join(' ')}
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
    </Root>
  );
}
