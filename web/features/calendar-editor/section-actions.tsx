import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const SectionActionsSlot = createContext<HTMLElement | null>(null);

export const SectionActionsProvider = SectionActionsSlot.Provider;

/** Places a step's creation action beside its heading, keeping the state in the step. */
export function SectionActions({ children }: { children: ReactNode }) {
  const slot = useContext(SectionActionsSlot);
  return slot ? createPortal(children, slot) : null;
}
