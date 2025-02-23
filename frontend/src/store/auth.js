// src/auth/authStore.js

import {create} from 'zustand';
import API from '../api'

const decodeToken = (token) => {
  if (!token) return null;
  const payload = token.split('.')[1];
  const decodedPayload = JSON.parse(atob(payload));
  return decodedPayload.exp;
};

const isTokenExpired = (expirationTime) => {
  const now = Math.floor(Date.now() / 1000);
  return now >= expirationTime;
};

const useAuthStore = create((set, get) => ({
  accessToken: localStorage.getItem('accessToken') || null,
  refreshToken: localStorage.getItem('refreshToken') || null,
  tokenExpiration: localStorage.getItem('tokenExpiration') || null,
  isAuthenticated: false,

  getToken: async () => {
    const expiration = localStorage.getItem('tokenExpiration')
    const tokenExpiration = localStorage.getItem('tokenExpiration');
      let accessToken = null;
      if (isTokenExpired(tokenExpiration)) {
        accessToken = await get().refreshToken();
      } else {
        accessToken = localStorage.getItem('accessToken');
      }

      return accessToken;
  },

  // Action to login
  login: async ({username, password}) => {
    try {
      const response = await API.login(username, password)
      if (response.access) {
        const expiration = decodeToken(response.access)
        set({
          accessToken: response.access,
          refreshToken: response.refresh,
          tokenExpiration: expiration, // 1 hour from now
          isAuthenticated: true
        });
        // Store in localStorage
        localStorage.setItem('accessToken', response.access);
        localStorage.setItem('refreshToken', response.refresh);
        localStorage.setItem('tokenExpiration', expiration);
      }
    } catch (error) {
      console.error('Login failed:', error);
    }
  },

  // Action to refresh the token
  refreshToken: async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return;

    try {
      const data = await API.refreshToken(refreshToken)
      if (data.access) {
        set({
          accessToken: data.access,
          tokenExpiration: decodeToken(data.access),
          isAuthenticated: true,
        });
        localStorage.setItem('accessToken', data.access);
        localStorage.setItem('tokenExpiration', decodeToken(data.access));

        return true;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      get().logout()
    }

    return false;
  },

  // Action to logout
  logout: () => {
    set({
      accessToken: null,
      refreshToken: null,
      tokenExpiration: null,
      isAuthenticated: false
    });
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('tokenExpiration');
  },

  initializeAuth: async () => {
    const refreshToken = localStorage.getItem('refreshToken') || null;

    if (refreshToken) {
      await get().refreshToken()
    } else {
      await get().logout()
    }
  },
}));

export default useAuthStore;
