import { resolve } from '../config/resolve';
import type { OverlayConfig } from '../config/schema';
import type { OverlayMessage } from '../protocol/messages';
import type { ObsClient } from '../transport/obs';
import type { OverlayRegistry } from './overlays';

export interface ConfigBroadcaster {
  onOverlayMessage(message: OverlayMessage, now: number): void;
  /** Call after every change to the editing configuration. */
  publish(config: OverlayConfig): void;
  onIdentified(): void;
}

/**
 * Keeps the overlays informed of the configuration, and the registry informed
 * of the overlays.
 *
 * Both duties live together because they are driven by the same three
 * messages, and separating them would mean reading the presence protocol
 * twice — with two chances of reading it differently.
 */
export function createConfigBroadcaster(options: {
  obs: Pick<ObsClient, 'broadcast'>;
  current(): OverlayConfig;
  registry: OverlayRegistry;
}): ConfigBroadcaster {
  function send(config: OverlayConfig) {
    options.obs.broadcast({ v: 1, t: 'config', config: resolve(config) });
  }

  return {
    onOverlayMessage(message, now) {
      // The capture page discards config and frame: those are its own messages
      // (spec §6).
      if (message.t === 'bye') {
        options.registry.forget(message.id);
        return;
      }
      if (message.t !== 'hello' && message.t !== 'beat') return;

      options.registry.seen(message.id, now);
      // An OBS started after Chrome must not wait for the next setting change.
      // A reloaded overlay arrives under a new id and holds nothing, so this
      // fires again for it — deduplicating here would leave it blank.
      if (message.t === 'hello') send(options.current());
    },
    publish(config) {
      send(config);
    },
    onIdentified() {
      // Nothing left while the socket was down, and the overlays on the other
      // side may have been waiting the whole time.
      send(options.current());
    },
  };
}
