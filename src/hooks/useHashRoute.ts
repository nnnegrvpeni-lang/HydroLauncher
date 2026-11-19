import { useCallback, useEffect, useState } from 'react';
import type { PageId } from '../components/TitleBar';

const PAGES: readonly PageId[] = ['home', 'instances', 'mods', 'skins', 'settings'];
const DEFAULT_PAGE: PageId = 'home';

/** Читает страницу из хэша: `#instances` или `#/instances`. */
function parseHash(): PageId {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return (PAGES as readonly string[]).includes(raw) ? (raw as PageId) : DEFAULT_PAGE;
}

/** Навигация по страницам через hash — переживает перезагрузку окна. */
export function useHashRoute(): [PageId, (page: PageId) => void] {
  const [page, setPage] = useState<PageId>(parseHash);

  useEffect(() => {
    const sync = () => setPage(parseHash());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const navigate = useCallback((next: PageId) => {
    const hash = `#${next}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash);
    }
    setPage(next);
  }, []);

  return [page, navigate];
}
