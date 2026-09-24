import { useLayoutEffect, useRef, useState } from 'react';

interface FragmentTokenState {
  ready: boolean;
  token: string | null;
}

export interface InviteFragmentCredential {
  kind: 'invite' | 'campaign' | null;
  ready: boolean;
  token: string | null;
}

function clearFragment() {
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
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
    clearFragment();
    setState({ ready: true, token: token || null });
  }, []);

  return state;
}

export function useInviteFragmentCredential(): InviteFragmentCredential {
  const consumed = useRef(false);
  const [state, setState] = useState<InviteFragmentCredential>({ kind: null, ready: false, token: null });

  useLayoutEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    const parameters = new URLSearchParams(window.location.hash.slice(1));
    const inviteToken = parameters.get('token');
    const campaignToken = parameters.get('campaign');
    clearFragment();
    if (inviteToken) setState({ kind: 'invite', ready: true, token: inviteToken });
    else if (campaignToken) setState({ kind: 'campaign', ready: true, token: campaignToken });
    else setState({ kind: null, ready: true, token: null });
  }, []);

  return state;
}
