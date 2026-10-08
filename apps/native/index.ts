// First: Latin-1 for TextDecoder (a library needs it as it loads), then core's setup, before anything uses them.
import './src/lib/textDecoder';
import { installErrorHandlers } from './src/lib/coreSetup';
import { registerRootComponent } from 'expo';
import App from './src/App';
import { installTheme } from './src/lib/theme';

installErrorHandlers();
installTheme();
registerRootComponent(App);
