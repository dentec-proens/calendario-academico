/// <reference types="vite/client" />
import { createElement, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import BackendStatus from '../../web/app/BackendStatus.tsx';
import { installAvailabilityClock } from './backend-availability-clock.ts';

type ConnectionState = ReturnType<ConvexReactClient['connectionState']>;
type ConnectionPatch = Partial<Pick<ConnectionState, 'isWebSocketConnected' | 'hasEverConnected'>>;

declare global {
  interface Window {
    backendAvailabilityTest: {
      setLoading: (loading: boolean) => void;
      setConnection: (patch: ConnectionPatch) => void;
      setOnline: (online: boolean) => void;
      draftElement: HTMLInputElement;
      draftMounts: number;
    };
  }
}

installAvailabilityClock();
const parameters = new URLSearchParams(window.location.search);
const initiallyReady = parameters.has('ready');
let online = true;
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
let connection: ConnectionState = {
  hasInflightRequests: false,
  isWebSocketConnected: initiallyReady || parameters.has('connected'),
  hasEverConnected: initiallyReady || parameters.has('connected'),
  timeOfOldestInflightRequest: null,
  connectionCount: 0,
  connectionRetries: 0,
  inflightActions: 0,
  inflightMutations: 0,
};
const subscribers = new Set<() => void>();
const client = {
  connectionState: () => connection,
  subscribeToConnectionState: (callback: () => void) => {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  },
};
let updateLoading: (loading: boolean) => void = () => {
  throw new Error('Availability fixture is not mounted.');
};
let mounts = 0;

function Draft() {
  const [mount] = useState(() => ++mounts);
  const [draft, setDraft] = useState('');
  return createElement(
    'label',
    { htmlFor: 'availability-draft', 'data-mount': mount },
    'Rascunho do calendário',
    createElement('input', {
      id: 'availability-draft',
      value: draft,
      onChange: (event) => setDraft(event.currentTarget.value),
    }),
  );
}

function Fixture() {
  const [loading, setLoading] = useState(!initiallyReady);
  useEffect(() => {
    updateLoading = setLoading;
  }, []);
  return createElement(
    ConvexProvider,
    { client: client as unknown as ConvexReactClient },
    createElement(BackendStatus, {
      loading,
      loadingLabel: 'Carregando dados de teste…',
      allowReload: parameters.has('allowReload'),
    }),
    createElement(Draft),
  );
}

const host = document.getElementById('root');
if (!host) throw new Error('Availability fixture requires a root element.');
flushSync(() => createRoot(host).render(createElement(Fixture)));
const draftElement = document.querySelector<HTMLInputElement>('#availability-draft');
if (!draftElement) throw new Error('Availability fixture requires a draft input.');
window.backendAvailabilityTest = {
  setLoading: (loading) => flushSync(() => updateLoading(loading)),
  setConnection(patch) {
    connection = { ...connection, ...patch };
    flushSync(() => subscribers.forEach((callback) => callback()));
  },
  setOnline(value) {
    online = value;
    flushSync(() => window.dispatchEvent(new Event(value ? 'online' : 'offline')));
  },
  draftElement,
  get draftMounts() {
    return mounts;
  },
};
