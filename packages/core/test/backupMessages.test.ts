import { strFromU8, strToU8, unzipSync } from 'fflate';
import { expect, it } from 'vitest';
import { exportBackupZip, parseBackupFile } from '../src/index.ts';
import { freshDb } from './helpers.ts';

// The message goes into the problem log, and a backup from elsewhere could carry any text.
it('a damaged backup is described without repeating its bad value', async () => {
  const db = await freshDb();
  const json = JSON.parse(strFromU8(unzipSync((await exportBackupZip(db)).bytes)['backup.json']));
  json.projects[0].status = 'SECRET-TEXT';
  const read = () => parseBackupFile(strToU8(JSON.stringify(json)));
  expect(read).toThrow(/projects\.0\.status: is not one of the allowed values/);
  expect(read).not.toThrow(/SECRET-TEXT/);
});
