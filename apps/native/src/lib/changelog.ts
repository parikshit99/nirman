import Constants from 'expo-constants';
import { parseChangelog, type ReleaseNotes } from '@nirman/core';

/** The newest section of CHANGELOG.md (put into the app by app.config.ts): this version's What's new. */
export const latestNotes: ReleaseNotes | undefined = parseChangelog(String(Constants.expoConfig?.extra?.changelog ?? ''))[0];
