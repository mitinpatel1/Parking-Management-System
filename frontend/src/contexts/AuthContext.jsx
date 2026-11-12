import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, store } from '../lib/api';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null), [loading, setLoading] = useState(true);
  useEffect(() => {
    let ok = true;
    if (!store.getToken()) { setLoading(false); return; }
    api('/auth/me').then(d => { if (ok) setUser(d.user); }).catch(() => { if (ok) store.setToken(null); }).finally(() => { if (ok) setLoading(false); });
    return () => { ok = false; };
  }, []);
  const login = async (email, password) => { const data = await api('/auth/login', { method: 'POST', body: { email, password } }); store.setToken(data.token); setUser(data.user); return data.user; };
  const register = async (fields) => { const data = await api('/auth/register', { method: 'POST', body: fields }); store.setToken(data.token); setUser(data.user); return data.user; };
  const logout = () => { store.setToken(null); setUser(null); };
  const value = useMemo(() => ({ user, loading, login, register, logout, setUser }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
