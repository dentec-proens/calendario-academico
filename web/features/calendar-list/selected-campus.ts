import { useFeatureRoute } from '../../app/navigation.ts';
import { useAppSession } from '../../app/session.tsx';

/** The campus in the URL, when it exists. Every profile reads the calendars of every campus. */
export function useSelectedCampus() {
  const { info } = useAppSession();
  const { campus } = useFeatureRoute();
  return info.campuses.find((item) => item.id === campus);
}
