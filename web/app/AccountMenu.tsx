import { Menu } from '@base-ui/react/menu';
import { ChevronDown, LogOut } from 'lucide-react';
import { ActionMenuItem } from '../components/ui/ActionMenu.tsx';
import '../components/ui/action-menu.css';
import './account-menu.css';

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toLocaleUpperCase('pt-BR');
}

/** The signed-in account behind one trigger: who is using the portal, and the way out. */
export function AccountMenu({
  name,
  email,
  scope,
  role,
  loggingOut,
  onLogout,
}: {
  name: string;
  email: string;
  /** The campus for a campus account, otherwise the profile. */
  scope?: string;
  role: string;
  loggingOut: boolean;
  onLogout: () => void;
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger className="account-menu" id="account" data-profile={role}>
        <span className="account-menu__avatar" aria-hidden="true">
          {initials(name)}
        </span>
        <span className="account-menu__identity">
          <span className="account-menu__name">{name}</span>
          {scope ? <span className="account-menu__scope">{scope}</span> : null}
        </span>
        <ChevronDown className="account-menu__chevron" aria-hidden="true" size={16} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className="ui-action-menu"
          align="end"
          sideOffset={6}
          collisionPadding={16}
        >
          <Menu.Popup className="ui-action-menu__popup account-menu__popup">
            <Menu.Group>
              <Menu.GroupLabel className="account-menu__summary">
                <span className="account-menu__summary-name">{name}</span>
                <span className="account-menu__summary-email">{email}</span>
                {scope ? <span className="account-menu__summary-scope">{scope}</span> : null}
              </Menu.GroupLabel>
              <Menu.Separator className="account-menu__separator" />
              <ActionMenuItem id="logout" disabled={loggingOut} onClick={onLogout}>
                <LogOut aria-hidden="true" size={18} /> Sair
              </ActionMenuItem>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
