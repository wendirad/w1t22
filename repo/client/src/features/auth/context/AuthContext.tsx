import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import httpClient from '../../../shared/api/httpClient';

interface User {
  _id: string;
  email: string;
  role: string;
  dealershipId: string | null;
  profile: {
    firstName: string;
    lastName: string;
    phone?: string;
  };
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      httpClient
        .get('/auth/me')
        .then(({ data }) => {
          setState({ user: data, isAuthenticated: true, isLoading: false });
        })
        .catch(() => {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('signingKey');
          setState({ user: null, isAuthenticated: false, isLoading: false });
        });
    } else {
      setState({ user: null, isAuthenticated: false, isLoading: false });
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await httpClient.post('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    if (data.signingKey) localStorage.setItem('signingKey', data.signingKey);
    setState({ user: data.user, isAuthenticated: true, isLoading: false });
  };

  const register = async (formData: any) => {
    const { data } = await httpClient.post('/auth/register', formData);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    if (data.signingKey) localStorage.setItem('signingKey', data.signingKey);
    setState({ user: data.user, isAuthenticated: true, isLoading: false });
  };

  const logout = () => {
    httpClient.post('/auth/logout').catch(() => {});
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('signingKey');
    setState({ user: null, isAuthenticated: false, isLoading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
