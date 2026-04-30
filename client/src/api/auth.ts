import axios from 'axios';

export interface AuthUser {
  _id: string;
  email: string;
  name: string;
  companyName: string;
  companyId: string | null;
}

const TOKEN_KEY = 'mp_auth_token';

/** Axios instance that auto-attaches the JWT from localStorage. */
const authedApi = axios.create({ baseURL: '/api' });
authedApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});
authedApi.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401 && window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default authedApi;

export const authAPI = {
  signup: (data: { email: string; password: string; companyName: string; name?: string }) =>
    axios.post<{ token: string; user: AuthUser }>('/api/auth/signup', data),
  login: (email: string, password: string) =>
    axios.post<{ token: string; user: AuthUser }>('/api/auth/login', { email, password }),
  me: () => authedApi.get<{ user: AuthUser; company: any }>('/auth/me'),
};

export const authStorage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};
