// First: Latin-1 for TextDecoder (a library needs it as it loads), then core's setup, before anything uses them.
import './src/lib/textDecoder';
import { installErrorHandlers } from './src/lib/coreSetup';
import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import App from './src/App';
import { installTheme } from './src/lib/theme';

// Keep the launch screen up until the data is open (Boot in src/App.tsx hides it), then fade into the app.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: 200 });
installErrorHandlers();
installTheme();
registerRootComponent(App);
