import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import OnlineUsersPanel from '../../web/portal/OnlineUsersPanel.tsx';
import '../../web/style.css';
import '../../web/portal.css';
import '../../web/portal/react-portal.css';

const subscribers = new Set<() => void>();
let result: unknown;
const client = {
  watchQuery: () => ({
    onUpdate: (callback: () => void) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    localQueryResult: () => result,
    journal: () => undefined,
  }),
};
window.setOnlineFixture = (value: unknown) => {
  result = value;
  subscribers.forEach((callback) => callback());
};
createRoot(document.getElementById('root')!).render(
  createElement(
    ConvexProvider,
    {
      client: client as unknown as ConvexReactClient,
    },
    createElement(OnlineUsersPanel),
  ),
);

declare global {
  interface Window {
    setOnlineFixture: (value: unknown) => void;
  }
}
