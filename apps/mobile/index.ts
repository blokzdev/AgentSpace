// Entry point — polyfills first, then register the root component.
import './polyfills';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
