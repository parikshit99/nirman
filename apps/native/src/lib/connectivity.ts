import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';
import { AppState } from 'react-native';
import type { Connectivity } from '@nirman/core';

export const connectivity: Connectivity = {
  async isOnline() {
    const state = await getNetworkStateAsync();
    return !!state.isConnected && state.isInternetReachable !== false;
  },
  onChange(fn) {
    addNetworkStateListener((state) => fn(!!state.isConnected && state.isInternetReachable !== false));
  },
  onResume(fn) {
    AppState.addEventListener('change', (s) => s === 'active' && fn());
  },
};
