'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Re-fetches this Server Component page on an interval so a Robinhood sync
 * landed by the inbox watcher (npm run sync:robinhood:watch) or a scheduled
 * check shows up here without a manual browser reload. Skips a tick while
 * the tab is hidden — a background tab has no one watching the refreshed
 * data, so there's no reason to re-run the page's queries.
 */
export default function AutoRefresh({ intervalSeconds = 45 }: { intervalSeconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, intervalSeconds * 1000);
    return () => clearInterval(id);
  }, [router, intervalSeconds]);

  return null;
}
