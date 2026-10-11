import { ensureProjects, JobWorker, loadSnapshot, logPerf, logStep, migrateLocal, removeOrphans, resetStuckJobs, settingsStore, type Db, type Settings, type Snapshot } from '@nirman/core';
import type { TextBox } from '@nirman/shared';
import Nirman from '../../modules/nirman-native';
import { connectivity } from '../lib/connectivity';

/** What the app's state needs from the data layer. */
export interface Services {
  db: Db;
  worker: JobWorker;
  /** Current settings; the worker reads the key from here. */
  settings: { current: Settings };
  /** Fires after every committed write (`Db.onWrite`): the worker's, a screen's or a restore's. */
  onDataChanged(fn: () => void): () => void;
}

/** Reads the text on a photo on the phone (no internet). */
const readPhotoText = async (image: string): Promise<TextBox[]> => (await Nirman.readText(image)).lines;

/** Brings the open database up to date and starts reading queued entries. */
export async function startServices(db: Db): Promise<{ services: Services; initial: Snapshot }> {
  const started = performance.now();
  await migrateLocal(db);
  await ensureProjects(db);
  await resetStuckJobs(db);
  const orphans = await removeOrphans(db);
  if (orphans.jobs || orphans.items || orphans.quotes) logStep('removed rows of deleted lists', orphans);

  const settings = { current: await settingsStore.load() };
  const worker = new JobWorker(
    db,
    () => settings.current,
    undefined,
    // Remember a replacement model so the next reading doesn't look it up again.
    (geminiModel) => {
      settings.current = { ...settings.current, geminiModel };
      void settingsStore.save(settings.current);
    },
    readPhotoText,
  );
  const services: Services = {
    db,
    worker,
    settings,
    // Every committed write, by the worker, a screen or a restore.
    onDataChanged: (fn) => db.onWrite(fn),
  };
  const initial = await loadSnapshot(db);
  logPerf('startup', performance.now() - started, { lists: initial.lists.length, items: initial.items.length, rates: initial.rates.length });
  void worker.start(connectivity);
  return { services, initial };
}
