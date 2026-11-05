import { useFeatureRoute } from '../../app/navigation.ts';
import { useAppSession } from '../../app/session.tsx';

/** The campus in the URL, when this profile may choose one and the campus exists for it. */
export function useSelectedCampus() {
  const { info, permissions } = useAppSession();
  const { campus } = useFeatureRoute();
  return permissions.selectCampus ? info.campuses.find((item) => item.id === campus) : undefined;
}
