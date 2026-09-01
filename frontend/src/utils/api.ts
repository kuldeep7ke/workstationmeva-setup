import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isAuthEndpoint = url.startsWith('/auth/login') || url.startsWith('/auth/signup');
    const path = window.location.pathname;
    // The teleprompter is a public studio screen — never kick it to login,
    // whether the machine is signed in or not.
    const isTeleprompter = path.startsWith('/teleprompter');
    if (error.response?.status === 401 && !isAuthEndpoint && !isTeleprompter) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Signed-out visitors belong on the landing page, not on /login.
      if (!path.startsWith('/login') && path !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
