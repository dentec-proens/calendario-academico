import { useAppSession } from '../../app/session.tsx';
import { useFeatureRoute } from '../../app/navigation.ts';
import CataloguePanel from './CataloguePanel.tsx';
export default function CataloguePage() {
  const { info, notify, permissions } = useAppSession();
  const route = useFeatureRoute();
  return (
    <section id="institution-events" className="page">
      <CataloguePanel
        key={route.eventId || 'new'}
        catalogue={info.catalogue}
        canManage={permissions.manageInstitution}
        notify={notify}
      />
    </section>
  );
}
