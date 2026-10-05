// Dashboard session state. The session lives in an HttpOnly cookie the browser cannot read;
// we learn whether it is valid by asking the server for the dashboard event.
// Swapping to customer accounts later only changes the login/logout calls here.

import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';

export function useDashboardAuth() {
  const [state, setState] = useState({ status: 'checking', event: null, error: null });

  const refresh = useCallback(async () => {
    try {
      const res = await api.dashboardEvent();
      setState({ status: 'authed', event: res.event, error: null });
    } catch (err) {
      if (err.status === 401) setState({ status: 'anonymous', event: null, error: null });
      else setState((s) => ({ ...s, status: s.status === 'authed' ? 'authed' : 'error', error: err }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (password) => {
      await api.login(password);
      await refresh();
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setState({ status: 'anonymous', event: null, error: null });
    }
  }, []);

  // Any API call that comes back 401 should drop the user to the login screen.
  const expire = useCallback(() => setState({ status: 'anonymous', event: null, error: null }), []);

  return { ...state, refresh, login, logout, expire };
}
