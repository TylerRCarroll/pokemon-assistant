import { useEffect, useState, type DependencyList } from 'react';

/** Resolve a promise into state; results from stale deps are discarded */
export function usePromise<T>(make: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<{ data?: T; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    setState({ loading: true });
    make().then((data) => live && setState({ data, loading: false }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
