import { Menu } from '@base-ui/react/menu';
import type { ComponentProps, ReactNode } from 'react';
import './action-menu.css';

/** Groups occasional actions behind one button, so they do not compete with the main ones. */
export function ActionMenu({
  trigger,
  label,
  disabled = false,
  children,
}: {
  trigger: ReactNode;
  /** The accessible name, needed when the trigger shows only an icon. */
  label?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        className="ui-button ui-button--secondary"
        aria-label={label}
        disabled={disabled}
      >
        {trigger}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className="ui-action-menu"
          align="end"
          sideOffset={6}
          collisionPadding={16}
        >
          <Menu.Popup className="ui-action-menu__popup">{children}</Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function ActionMenuItem(props: ComponentProps<typeof Menu.Item>) {
  return <Menu.Item {...props} className="ui-action-menu__item" />;
}
