import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, clearToken, getToken } from '../api/client';
import { connectSSE, disconnectSSE } from '../api/sseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await api.get('/auth/me');
        setUser(me);
      } catch {
        clearToken();
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
  }, []);

  // Opens/closes the one shared live-update connection for the whole
  // app in lockstep with auth state — covers both the login() path
  // below and the bootstrap-from-existing-token path above (page
  // load/refresh with a token already in localStorage), since both
  // ultimately just set `user`. connectSSE()/disconnectSSE() are both
  // no-ops if called when already in the requested state, so this
  // effect re-firing on unrelated re-renders is harmless.
  useEffect(() => {
    if (user) connectSSE();
    else disconnectSSE();
  }, [user]);

  async function login(email, password) {
    const { token, user: loggedInUser } = await api.post('/auth/login', { email, password });
    setToken(token);
    setUser(loggedInUser);
    return loggedInUser;
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
