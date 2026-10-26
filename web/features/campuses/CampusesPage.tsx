import { useNavigate } from '@tanstack/react-router';
import { useAppSession } from '../../app/session.tsx';
import CampusesPanel from './CampusesPanel.tsx';

export default function CampusesPage() {
  const { info, notify } = useAppSession();
  const navigate = useNavigate();
  return (
    <CampusesPanel
      info={info}
      notify={notify}
      onCampus={(campus) => {
        void navigate({ to: '/calendarios', search: { campus } });
      }}
    />
  );
}
