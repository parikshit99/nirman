// First: core must be configured before anything uses it.
import './src/lib/coreSetup';
import { registerRootComponent } from 'expo';
import App from './src/App';

registerRootComponent(App);
