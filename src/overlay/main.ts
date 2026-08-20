import { mount } from 'svelte';
import App from './App.svelte';

// The single face the key labels are drawn in. The interface faces stay out:
// this bundle is what OBS keeps loaded for the whole stream (spec §5.1).
import '../styles/fonts-broadcast.css';

mount(App, { target: document.getElementById('app')! });
