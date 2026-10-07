import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/playfair-display/400-italic.css';
import App from './App.tsx';
import { DialogProvider } from './components/Dialogs.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { installErrorHandlers, logError, logPerf } from './lib/diagnostics.ts';
import { ensureProjects, loadSnapshot, resetStuckJobs } from './data/repo.ts';
import { migrateLocal } from './data/schema.ts';
import { openCapacitorSqlite, openSqlJs, type Db } from './data/sql.ts';
import { JobWorker } from './jobs/worker.ts';
import { installBackButton } from './lib/backButton.ts';
import { connectivity } from './lib/connectivity.ts';
import { isNative } from './lib/platform.ts';
import { AppStateProvider, type Services } from './state/AppState.tsx';
import { settingsStore } from './lib/settings.ts';
import { installTheme } from './lib/theme.ts';
import './index.css';

installTheme();

async function openDatabase(): Promise<Db> {
  if (isNative) return openCapacitorSqlite('nirmaan');
  const { default: wasmUrl } = await import('sql.js/dist/sql-wasm.wasm?url');
  return openSqlJs({ locateFile: () => wasmUrl, persistKey: 'nirmaan.db' });
}

async function bootstrap() {
  installErrorHandlers();
  const started = performance.now();
  const root = createRoot(document.getElementById('root')!);
  try {
    const db = await openDatabase();
    await migrateLocal(db);
    await ensureProjects(db);
    await resetStuckJobs(db);

    const settings = { current: await settingsStore.load() };
    const dataListeners = new Set<() => void>();
    const worker = new JobWorker(
      db,
      () => settings.current,
      () => dataListeners.forEach((fn) => fn()),
      undefined,
      // Remember a replacement model so the next reading doesn't look it up again.
      (geminiModel) => {
        settings.current = { ...settings.current, geminiModel };
        void settingsStore.save(settings.current);
      },
    );
    const services: Services = {
      db,
      worker,
      settings,
      onDataChanged(fn) {
        dataListeners.add(fn);
        return () => dataListeners.delete(fn);
      },
    };
    const initial = await loadSnapshot(db);
    logPerf('startup', performance.now() - started, { lists: initial.lists.length, items: initial.items.length, rates: initial.rates.length });

    root.render(
      <StrictMode>
        <ErrorBoundary>
          <DialogProvider>
            <AppStateProvider services={services} initial={initial}>
              <App />
            </AppStateProvider>
          </DialogProvider>
        </ErrorBoundary>
      </StrictMode>,
    );
    await installBackButton();
    await worker.start(connectivity);
  } catch (err) {
    console.error(err);
    logError(err, 'startup');
    root.render(
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-lg font-bold mb-2">Could not open the app's storage</h1>
          <p className="text-sm text-gray-500">{(err as Error).message}</p>
        </div>
      </div>,
    );
  }
}

void bootstrap();
