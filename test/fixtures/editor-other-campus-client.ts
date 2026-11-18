import type { Id } from '../../convex/_generated/dataModel.js';
import { fixtureProfile, record } from './editor-client.ts';
// A campus account opening the calendar of another campus, or of its own with `?proprio`.
fixtureProfile.role = 'CAMPUS';
if (new URLSearchParams(location.search).has('proprio')) fixtureProfile.campusId = record.campusId;
else {
  fixtureProfile.campusId = 'campus-b' as Id<'campuses'>;
  // As the server sends it to another campus: no authors, submission, return or review.
  delete record.createdByName;
  delete record.updatedByName;
  delete record.readiness.ready;
  delete record.readiness.humanReview;
  record.submission = null;
  record.lastReturn = null;
}
export { convex, functions } from './editor-event-drafts-client.ts';
