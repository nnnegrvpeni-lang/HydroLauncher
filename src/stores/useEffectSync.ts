import { useEffect } from 'react';

/** Хук-обёртка, чтобы вызывать эффекты однократно при монтировании. */
export function useEffectSync(effect: () => void, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, deps);
}
