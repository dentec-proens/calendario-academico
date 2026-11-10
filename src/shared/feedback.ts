/**
 * Rules of the quick feedback, shared by the backend and the screens so the administration's
 * reminder of the retention and the actual removal never diverge.
 */

const day = 24 * 60 * 60_000;

/** Records are removed after this; the label is how the administration's screen states it. */
export const feedbackRetentionDays = 365;
export const feedbackRetentionLabel = '1 ano';
export const feedbackRetention = feedbackRetentionDays * day;

/** No new invitation while the person gave any feedback within this interval. */
export const feedbackInterval = 14 * day;

/** The person may change the rating or add a comment for this long after the invitation. */
export const feedbackEditWindow = 30 * 60_000;

export const maximumFeedbackComment = 2000;

/** Lifecycle actions that invite feedback, and the context each one belongs to. */
export const feedbackContexts = {
  submit: 'submit',
  conclude: 'review',
  return: 'review',
} as const;

export type InvitationContext = (typeof feedbackContexts)[keyof typeof feedbackContexts];
export type FeedbackContext = InvitationContext | 'spontaneous';

export function invitationContext(action: string): InvitationContext | null {
  return Object.hasOwn(feedbackContexts, action)
    ? feedbackContexts[action as keyof typeof feedbackContexts]
    : null;
}

export const feedbackQuestions: Record<FeedbackContext, string> = {
  submit: 'Como foi montar este calendário?',
  review: 'Como foi revisar este calendário?',
  spontaneous: 'Como está sendo usar o app Calendários Acadêmicos?',
};

/** The question measures effort, so the scale says so; 1 is the hardest. */
export const feedbackRatings = [
  'Muito difícil',
  'Difícil',
  'Razoável',
  'Fácil',
  'Muito fácil',
] as const;

export function validRating(rating: number) {
  return Number.isInteger(rating) && rating >= 1 && rating <= feedbackRatings.length;
}

/** Whole days left before the record is removed, never negative; 0 means it goes today. */
export function daysUntilRemoval(at: number, now: number) {
  return Math.max(0, Math.floor((at + feedbackRetention - now) / day));
}
