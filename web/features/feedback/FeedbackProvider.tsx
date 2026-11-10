import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMutation } from 'convex/react';
import { MessageSquareHeart } from 'lucide-react';
import { invitationContext, type InvitationContext } from '#src/shared/feedback.ts';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { Button } from '../../components/ui/Button.tsx';
import { functions } from '../../shared/convex/client.ts';
import { portalRelease } from '../../shared/convex/report-error.ts';
import FeedbackInvite, { type Invitation } from './FeedbackInvite.tsx';
import './feedback.css';

interface FeedbackActions {
  /** After a lifecycle action succeeds: the server decides whether to invite. */
  offer: (action: string, calendarId: string) => void;
  /** The person asked to give a suggestion. */
  openSuggestions: (origin?: HTMLElement | null) => void;
}

const noFeedback: FeedbackActions = { offer: () => {}, openSuggestions: () => {} };
const FeedbackContext = createContext<FeedbackActions>(noFeedback);

export const useFeedback = () => useContext(FeedbackContext);

/**
 * Holds the one invitation on screen. It lives above the routes because the editor and the
 * workspace are sibling layouts, and the editor mounts its lifecycle actions twice.
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Invitation | null>(null);
  /** What is on screen, and whether an invitation is being asked for, read outside renders. */
  const onScreen = useRef<Invitation | null>(null);
  const asking = useRef(false);
  const origin = useRef<HTMLElement | null>(null);
  const open = useMutation(functions.feedback.openFeedbackPrompt);

  const show = useCallback((invitation: Invitation | null) => {
    onScreen.current = invitation;
    setCurrent(invitation);
  }, []);

  const offer = useCallback(
    (action: string, calendarId: string) => {
      const context: InvitationContext | null = invitationContext(action);
      // Nothing on screen is replaced, and no invitation is recorded behind it.
      if (!context || onScreen.current || asking.current) return;
      asking.current = true;
      // The invitation is optional: failing to open it is not worth a message, and never turns
      // the action that just succeeded into a failure.
      Promise.resolve()
        .then(() =>
          open({
            context,
            calendarId: calendarId as Id<'calendars'>,
            route: window.location.pathname,
            release: portalRelease,
          }),
        )
        .then(
          (id) => {
            if (id && !onScreen.current) show({ kind: 'invitation', id, context, key: id });
          },
          () => {},
        )
        .finally(() => {
          asking.current = false;
        });
    },
    [open, show],
  );

  const openSuggestions = useCallback(
    (from?: HTMLElement | null) => {
      origin.current = from ?? null;
      show({ kind: 'spontaneous', key: `spontaneous:${Date.now()}` });
    },
    [show],
  );

  const close = useCallback(() => {
    const spontaneous = current?.kind === 'spontaneous';
    show(null);
    // Focus was moved into the suggestion the person opened; it goes back where it came from.
    if (spontaneous && origin.current?.isConnected) origin.current.focus();
    origin.current = null;
  }, [current, show]);

  const actions = useMemo(() => ({ offer, openSuggestions }), [offer, openSuggestions]);
  return (
    <FeedbackContext.Provider value={actions}>
      {children}
      <div id="feedback-invite" className="feedback-invite" role="status" aria-live="polite">
        {current ? <FeedbackInvite key={current.key} invitation={current} onClose={close} /> : null}
      </div>
    </FeedbackContext.Provider>
  );
}

/** Always within reach in the header, for feedback on the person's own initiative. */
export function SuggestionsButton() {
  const { openSuggestions } = useFeedback();
  return (
    <Button
      type="button"
      id="suggestions"
      variant="secondary"
      className="header-suggestions"
      onClick={(event) => openSuggestions(event.currentTarget)}
    >
      <MessageSquareHeart aria-hidden="true" size={18} /> Sugestões
    </Button>
  );
}
