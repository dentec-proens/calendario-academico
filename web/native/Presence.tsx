import { useEffect } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { convex, functions } from './client.ts';

export default function NativePresence() {
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(functions.nativeAuth.me, isAuthenticated ? {} : 'skip');
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const tabId = crypto.randomUUID();
    let disposed = false;
    let suspended = false;
    let sending = false;
    let token: string | undefined;
    const disconnect = (sessionToken: string) => {
      void convex.mutation(functions.presence.disconnect, { sessionToken }).catch(() => {
        // The server also expires missed heartbeats after 90 seconds.
      });
    };
    const beat = async () => {
      if (disposed || suspended || sending) return;
      sending = true;
      try {
        const result = await convex.mutation(functions.presence.heartbeat, { tabId });
        if (disposed || suspended) disconnect(result.sessionToken);
        else token = result.sessionToken;
      } catch {
        // Retry on the next heartbeat; presence must not interrupt calendar work.
      } finally {
        sending = false;
      }
    };
    const hide = () => {
      suspended = true;
      if (!token) return;
      const sessionToken = token;
      token = undefined;
      const sent = navigator.sendBeacon(
        `${convex.url}/api/mutation`,
        new Blob([JSON.stringify({ path: 'presence:disconnect', args: { sessionToken } })], {
          type: 'application/json',
        }),
      );
      if (!sent) disconnect(sessionToken);
    };
    const show = () => {
      suspended = false;
      void beat();
    };
    const visible = () => {
      if (!document.hidden) void beat();
    };
    void beat();
    const timer = window.setInterval(() => {
      void beat();
    }, 36_000);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    window.addEventListener('online', show);
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
      window.removeEventListener('online', show);
      document.removeEventListener('visibilitychange', visible);
      if (token) disconnect(token);
    };
  }, [userId]);
  return null;
}
