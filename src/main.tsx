import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import App from './App';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="bottom-left" />
      <App />
    </MantineProvider>
  </React.StrictMode>
);
