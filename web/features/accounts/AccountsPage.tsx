import { useAppSession } from '../../app/session.tsx';
import AccountsPanel from './AccountsPanel.tsx';
export default function AccountsPage() {
  const { info, status, notify } = useAppSession();
  return <AccountsPanel info={info} googleEnabled={status.googleEnabled} notify={notify} />;
}
