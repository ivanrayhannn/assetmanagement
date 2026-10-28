import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBackend } from './api';
import { AppProvider } from './app/AppContext';
import App from './App';
import './styles/index.css';

const root = createRoot(document.getElementById('root')!);

createBackend().then(
  (backend) =>
    root.render(
      <StrictMode>
        <AppProvider backend={backend}>
          <App />
        </AppProvider>
      </StrictMode>,
    ),
  (e: unknown) => root.render(<div className="loading">Gagal memulai aplikasi: {String(e)}</div>),
);
