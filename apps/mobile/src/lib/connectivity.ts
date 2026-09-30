import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import type { Connectivity } from '../jobs/worker.ts';

export const connectivity: Connectivity = {
  async isOnline() {
    return (await Network.getStatus()).connected;
  },
  onChange(fn) {
    void Network.addListener('networkStatusChange', (s) => fn(s.connected));
  },
  onResume(fn) {
    void App.addListener('resume', fn);
  },
};
