import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import axios from 'axios';
import App from './App';
import store from './store';

/**
 * Axios Request Interceptor
 * Adds JWT token to Authorization header automatically
 */
axios.interceptors.request.use(
  (config) => {
    // Get user from localStorage
    const user = JSON.parse(localStorage.getItem('user'));

    // If user exists and has access token, add to headers
    if (user && user.access) {
      config.headers.Authorization = `Bearer ${user.access}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Axios Response Interceptor
 * Handles 401 errors (token expired) and attempts refresh
 */
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retried
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Try to refresh token
        const user = JSON.parse(localStorage.getItem('user'));
        if (user && user.refresh) {
          const response = await axios.post(
            (process.env.REACT_APP_API_URL || 'http://localhost:8000/api') + '/auth/refresh/',
            { refresh: user.refresh }
          );

          // Update token
          user.access = response.data.access;
          localStorage.setItem('user', JSON.stringify(user));

          // Retry original request
          originalRequest.headers.Authorization = `Bearer ${response.data.access}`;
          return axios(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, clear user
        localStorage.removeItem('user');
        window.location.href = '/';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    {/* Redux Store Provider */}
    <Provider store={store}>
      {/* React Router Provider */}
      <BrowserRouter>
        {/* UI Kütüphanesi Tema Ayarları */}
        <MantineProvider
          defaultColorScheme="light"
          theme={{
            primaryColor: 'blue',
            fontFamily: 'Roboto, sans-serif',
          }}
        >
          <Notifications position="top-right" />
          <App />
        </MantineProvider>
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
