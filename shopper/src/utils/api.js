import axios from 'axios';
import { Capacitor } from '@capacitor/core';

// Production EC2 endpoint for native mobile application
const PRODUCTION_API_URL = 'https://api.swabhivar.com/api';

export const resolveBackendUrl = (url) => {
  // If running inside Capacitor native shell and configured URL is relative, route to production server
  if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
    const configured = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
    if (configured && !configured.startsWith('/')) {
      return configured;
    }
    return PRODUCTION_API_URL;
  }
  return url || import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api';
};

export const BACKEND_URL = resolveBackendUrl(import.meta.env.VITE_BACKEND_URL);

const api = axios.create({
  baseURL: resolveBackendUrl(import.meta.env.VITE_API_URL),
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
