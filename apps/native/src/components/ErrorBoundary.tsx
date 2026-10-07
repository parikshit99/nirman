import { Component, type ErrorInfo, type ReactNode } from 'react';
import { DevSettings, Text, View } from 'react-native';
import { logError } from '@nirman/core';
import { Button } from './ui/Button';

/** If a screen crashes, log it and offer to reload instead of showing a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    logError(error, `render${info.componentStack?.split('\n')[1]?.trim().replace(/^at /, ' ') ?? ''}`);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Something went wrong</Text>
        <Text style={{ fontSize: 14, textAlign: 'center', color: '#6a7282' }}>Your data is safe. Open the app again; if it happens again, use Settings → Report a problem.</Text>
        <Button variant="primary" onPress={() => (__DEV__ ? DevSettings.reload() : this.setState({ failed: false }))}>
          Try again
        </Button>
      </View>
    );
  }
}
