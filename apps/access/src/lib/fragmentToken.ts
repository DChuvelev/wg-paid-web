import { useLayoutEffect, useRef, useState } from 'react';

interface FragmentTokenState {
  ready: boolean;
  token: string | null;
}

export function useFragmentToken(): FragmentTokenState {
  const consumed = useRef(false);
  const [state, setState] = useState<FragmentTokenState>({ ready: false, token: null });

  useLayoutEffect(() => {
    if (consumed.current) {
      return;
    }
    consumed.current = true;

    const parameters = new URLSearchParams(window.location.hash.slice(1));
    const token = parameters.get('token');
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    setState({ ready: true, token: token || null });
  }, []);

  return state;
}
