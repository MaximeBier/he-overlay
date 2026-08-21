import { mount } from 'svelte';
import App from './App.svelte';
import { isOrdinaryBrowser } from './host';
import { applyChromeTokens } from './chrome-tokens';

// The single face the key labels are drawn in. The interface faces stay out:
// this bundle is what OBS keeps loaded for the whole stream (spec §5.1).
import '../styles/fonts-broadcast.css';

/**
 * Decided here, before anything renders, and handed to the page as a fact.
 *
 * The palette is applied only for a person looking at this in a browser: in
 * OBS no variable is ever declared, which is one more reason the decoration
 * cannot appear on air even if something else went wrong (spec §16.7).
 */
const decorated = isOrdinaryBrowser(window);
if (decorated) applyChromeTokens(document.documentElement);

mount(App, { target: document.getElementById('app')!, props: { decorated } });
