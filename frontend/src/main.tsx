import { openDraft } from './draft';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(<p role="status">Открываем редактор…</p>);

openDraft().then(({ store, draft, imported }) => {
  root.render(<StrictMode><App store={store} draft={draft} importedFiles={imported} /></StrictMode>);
}).catch(() => {
  root.render(<StrictMode><App storageError="Не удалось открыть локальный черновик. Автосохранение недоступно." /></StrictMode>);
});
