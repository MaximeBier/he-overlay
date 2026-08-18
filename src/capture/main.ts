import { mount } from 'svelte';
import App from './App.svelte';
import { applyTokens } from '../styles/ui-tokens';
import '../styles/app.css';

// Only the capture page. The overlay consumes no interface token, and handing
// it some would reopen the coupling this separation closes.
applyTokens(document.documentElement);

mount(App, { target: document.getElementById('app')! });
