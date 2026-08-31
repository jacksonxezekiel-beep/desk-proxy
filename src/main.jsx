import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './DeskApp_1.jsx';
import Gate from './gate.jsx';

// The Gate handles: site on/off, owner preview, login, and the subscription
// paywall. The trading app only mounts once access is granted.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Gate><App /></Gate>
  </React.StrictMode>
);
