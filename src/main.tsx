import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import App from './App';
import { resolveMode, resolveProjectId, resolveViewCode } from './mode';
import { PhoneNotice } from './PhoneNotice';
import { isPhoneSize } from './smallScreen';
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

/**
 * Phones get a notice instead of the app (smallScreen.ts), decided once at
 * load. The app isn't mounted behind it, so no map tiles download.
 */
function Root() {
  const [phoneOk, setPhoneOk] = useState(() => !isPhoneSize(window.innerWidth, window.innerHeight));
  if (!phoneOk) return <PhoneNotice onContinue={() => setPhoneOk(true)} />;
  return <App mode={resolveMode()} initialProjectId={resolveProjectId()} initialViewCode={resolveViewCode()} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="bottom-left" />
      {/* Resolved once at startup: the mode can't change without a reload,
          and reading it here keeps App itself free of URL concerns. */}
      <Root />
    </MantineProvider>
  </React.StrictMode>
);
