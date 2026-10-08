// First: core must be configured before anything uses it.
import { installErrorHandlers } from './src/lib/coreSetup';
import { registerRootComponent } from 'expo';
import App from './src/App';
import { installTheme } from './src/lib/theme';

installErrorHandlers();
installTheme();
registerRootComponent(App);
