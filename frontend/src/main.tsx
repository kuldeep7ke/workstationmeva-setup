import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { UndoProvider } from './context/UndoContext';
import { SocketProvider } from './context/SocketContext';
import { DialogProvider } from './context/DialogContext';
import { initTelemetry } from './lib/telemetry';
import App from './App';
import './index.css';

initTelemetry();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <DialogProvider>
            <UndoProvider>
              <SocketProvider>
                <App />
              </SocketProvider>
            </UndoProvider>
          </DialogProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
