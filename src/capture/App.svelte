<script lang="ts">
  import { untrack } from 'svelte';
  import { createKeyboardLink, type KeyboardStatus } from '../keyboard/device';
  import {
    createObsClient,
    DEFAULT_OBS_PORT,
    MAX_PORT,
    normalizePort,
    type ObsClient,
    type ObsStatus,
  } from '../transport/obs';
  import { createCaptureSession } from './session';
  import { loadSettings, saveSettings, overlayUrl, browserStorage, keyboardHint } from './settings';
  import { createOverlayRegistry } from './overlays';
  import { createConfigBroadcaster } from './broadcast';
  import { addLearnedKey, pickLearned, removeKey, removeKeys } from './learn';
  import { loadLayoutMap, resolveLayout, type LayoutMapLike } from '../keyboard/labels';
  import { setLayoutOverride } from '../config/edit';
  import { createAxisSuggester } from './suggest';
  import { hasOverrides, resolve } from '../config/resolve';
  import { recommendedSize } from '../view/scene';
  import KeyLearner from './KeyLearner.svelte';
  import LayoutEditor from './LayoutEditor.svelte';
  import StylePanel from './StylePanel.svelte';
  import { createProfileStore, exportConfig, importConfig } from '../config/storage';
  import { DEFAULT_STYLE, STYLE_KEYS, type OverlayConfig } from '../config/schema';
  import StatusBar from './StatusBar.svelte';
  import Wizard from './Wizard.svelte';
  import Diagnostics from './Diagnostics.svelte';
  import Collapsible from './Collapsible.svelte';
  import Gated from './Gated.svelte';
  import { createJournal, describeAnomaly, hexDump, type JournalEntry } from './journal';
  import { createStreamProbe, type StreamReading } from './probe';
  import {
    loadStatus,
    nextStep,
    saveStatus,
    showsResume,
    showsWizard,
    stepNumber,
    type WizardStatus,
  } from './wizard';
  import ProfileBar from './ProfileBar.svelte';
  import Toast from './Toast.svelte';
  import {
    importToast,
    loadToast,
    profileStatus,
    READ_FAILED,
    type Health,
    type Notice,
  } from './notice';
  import type { DecodeAnomaly } from '../keyboard/decode';
  import type { FrameKey } from '../protocol/messages';

  const storage = browserStorage();

  let settings = $state(loadSettings(storage));
  let keyboardStatus = $state<KeyboardStatus>('disconnected');
  /** The product name of the keyboard that answered, for the wizard's first step. */
  let keyboardName = $state<string | null>(null);
  let obsStatus = $state<ObsStatus>('idle');
  let frame = $state<readonly FrameKey[]>([]);

  const profiles = createProfileStore(storage);
  // Read once, before the rune: this is the startup value, not a subscription.
  const openedName = profiles.active();
  let profile = $state(openedName);
  let profileNames = $state(profiles.list());

  const opened = profiles.load(openedName);
  let config = $state(opened.config);

  /**
   * What the open profile is worth, kept past the toast that announced it.
   *
   * The two are not redundant (spec §16.6): the toast says something just
   * happened, this says what we are looking at — hours later, when the only
   * question left is why there are four keys instead of six.
   */
  let health = $state<Health>({
    problem: opened.problem,
    dropped: opened.dropped,
    from: 'load',
  });

  /** The passing half. Replaced, never queued: the last thing said is the one that matters. */
  let toast = $state<Notice | null>(loadToast(opened.problem));

  let learning = $state(false);
  /** The label of the last key learned, which the wizard's third step confirms. */
  let lastKey = $state<string | null>(null);

  let selectedIds = $state<number[]>([]);
  let layout = $state<LayoutMapLike | null>(null);
  void loadLayoutMap(navigator).then((map) => (layout = map));

  // What the labels are actually read from: the explicit choice always beats
  // detection, which is the only reason the choice exists (spec §8.6).
  const activeLayout = $derived(resolveLayout(config.layoutOverride, layout));

  // The packed size, which is the only one worth quoting: the raw box has an
  // empty top and left by construction (spec §5.4).
  const size = $derived(recommendedSize(resolve(config)));

  const suggester = createAxisSuggester();

  /**
   * Bumped when the suggester learns something, and read by the list below.
   *
   * Its three sets are plain data, so nothing about them is reactive. Polling
   * them on every report is not an option either: reports arrive at up to a
   * thousand a second and the answer changes perhaps twice a session.
   */
  let observed = $state(0);

  /**
   * The configured keys the suggester currently speaks for.
   *
   * Derived, never cached — and that is the fix for a real defect. The first
   * version kept a snapshot refreshed only when the suggester learned
   * something, which lost exactly the keys that matter: adding a key means
   * pressing it, so it reaches full travel *before* it exists in
   * `config.keys`. The refresh then filtered a list without it, and every
   * later press taught the suggester nothing new — so it never spoke again.
   * Reading `config` here means the list also follows a key being added.
   */
  const suggestedIds = $derived.by(() => {
    void observed;
    return config.keys.map((key) => key.id).filter((id) => suggester.suggests(id));
  });

  let rate = $state(0);
  let overlayCount = $state(0);

  /**
   * Everything worth writing down, for the report nobody can write blind
   * (spec §11). Mirrored into state because the journal is plain data: it is
   * appended to from four event handlers and read by one panel.
   */
  const journal = createJournal();
  let log = $state<readonly JournalEntry[]>([]);
  /** §9.3: a fold says in its header when what it hides is ours to fix. */
  const toReport = $derived(log.filter((entry) => entry.kind === 'bug').length);

  function note(kind: 'user' | 'bug', message: string) {
    journal.add(kind, message, performance.now());
    log = journal.entries();
  }

  /**
   * The live reading — a function, not a derived value.
   *
   * It follows `frame`, which arrives up to sixty times a second. Passed as a
   * function, it is only ever called from inside the fold's body, so a shut
   * fold reads no frame at all and the capture page never competes with its
   * own broadcast over a list nobody can see.
   */
  function readings() {
    return config.keys.map((key) => {
      const seen = frame.find(([id]) => id === key.id);
      return { id: key.id, label: key.label, travel: seen?.[1] ?? 0, active: seen?.[2] === 1 };
    });
  }

  let capturing = $state(false);
  let snapshot = $state<string | null>(null);

  /**
   * A probe on the report stream, never on a clock (global constraint 1).
   * Its reading is refreshed on emitted frames rather than on reports: reports
   * arrive at up to a thousand a second, and re-rendering at that rate is the
   * stutter this page exists to avoid.
   */
  const streamProbe = createStreamProbe();
  let probing = $state(false);
  let probeReading = $state<StreamReading | null>(null);

  function toggleProbe() {
    if (streamProbe.running) streamProbe.stop(performance.now());
    else streamProbe.start(performance.now());
    probing = streamProbe.running;
    probeReading = streamProbe.reading();
    note('user', probing ? 'Background probe started.' : 'Background probe stopped.');
  }

  /**
   * A throwaway connection, opened to answer one question: are the port and
   * password as typed good, *now*?
   *
   * Separate from the live client on purpose. That one carries a reconnection
   * backoff, so after a few failures it answers "not yet" rather than "no" —
   * which is the wrong answer to someone who has just retyped a password.
   */
  let obsProbe = $state<string | null>(null);

  function testObs() {
    obsProbe = 'testing…';

    const probe = createObsClient({
      url: `ws://localhost:${port}`,
      password: settings.password,
      onStatus: (status) => {
        // 'connecting' is not an answer. Everything else is terminal, and the
        // socket closes on the spot: nothing is ever sent through this one,
        // and leaving it open would show a second client in OBS for good.
        if (status === 'connecting') return;
        obsProbe = status;
        note('user', `OBS probe: ${status}.`);
        probe.close();
      },
      onMessage: () => {},
    });

    probe.connect();
  }

  const overlays = createOverlayRegistry();

  let setup = $state<WizardStatus>(loadStatus(storage));
  const step = $derived(
    nextStep({
      keyboard: keyboardStatus,
      obs: obsStatus,
      overlays: overlayCount,
      keyCount: config.keys.length,
    }),
  );
  const wizardOpen = $derived(showsWizard(setup, step));
  const canResume = $derived(showsResume(setup, step));

  /**
   * Written the first time everything works, whether the wizard was followed
   * or skipped. Without it, an OBS restart the next evening reopens a setup
   * that was finished weeks ago — `nextStep` reads the world, not history.
   */
  $effect(() => {
    if (step === 'done' && setup !== 'done') remember('done');
  });

  function remember(status: WizardStatus) {
    setup = status;
    saveStatus(storage, status);
  }

  /** A synchronous reading, not a timer: allowed on the capture page. */
  function refreshOverlays() {
    overlayCount = overlays.count(performance.now());
  }

  // An empty number field binds to null, and `ws://localhost:null` throws
  // inside the WebSocket constructor. The displayed URL has to survive that
  // half-typed state too, so it reads the normalized port rather than the field.
  let port = $derived(normalizePort(settings.port));
  let url = $derived(overlayUrl(location.origin, { port, password: settings.password }));

  function createClient(): ObsClient {
    return createObsClient({
      url: `ws://localhost:${untrack(() => port)}`,
      password: untrack(() => settings.password),
      onStatus: (s) => {
        obsStatus = s;
        note('user', `OBS: ${s}.`);
        // Nothing left while the socket was down, and an overlay on the other
        // side may have been waiting the whole time.
        if (s === 'identified') broadcaster.onIdentified();
        if (s !== 'identified') {
          // Nobody is reachable through a dead socket, and expiry is only
          // computed on read: a count left standing would never come down.
          overlays.clear();
          refreshOverlays();
          // Same for the rate. Its window ages on keyboard reports, so with
          // nobody typing the last good figure would stay on screen — a
          // throughput advertised beside a dot saying the link is dead. No
          // frame is leaving, and zero is simply the truth.
          rate = 0;
        }
      },
      onForeignVersion: (version) => {
        // Almost always an overlay left open across a deployment. It goes
        // quiet with nothing to say why, which is the whole reason this line
        // exists (spec §11).
        note('user', `An overlay is running protocol v${version}; reload it.`);
      },
      onMessage: (message) => {
        // Presence and configuration are both driven by these three messages,
        // so one place reads them (spec §6).
        broadcaster.onOverlayMessage(message, performance.now());
        // Spec §6: a fresh overlay holds nothing, and the emitter would
        // otherwise deduplicate its way to a blank page until the next
        // keystroke.
        if (message.t === 'hello') session.resend(performance.now());
        refreshOverlays();
      },
    });
  }

  let obs: ObsClient = createClient();

  const broadcaster = createConfigBroadcaster({
    obs: { broadcast: (message) => obs.broadcast(message) },
    current: () => config,
    registry: overlays,
  });

  /**
   * Credentials are persisted and the client rebuilt, never patched: url and
   * password are read once, when the socket opens. A password typed after the
   * client was built is the milestone 1 defect that made authentication
   * impossible to satisfy.
   */
  function reconnect() {
    settings.port = port;
    saveSettings(storage, settings);
    obs.close();
    obs = createClient();
    obs.connect();
  }

  /**
   * The one door every configuration change goes through — learning, moving,
   * styling, mode. Persisting without broadcasting, or the reverse, is the
   * failure this shape makes unwritable.
   */
  function updateConfig(next: OverlayConfig) {
    config = next;
    profiles.save(profile, config);
    broadcaster.publish(config);
  }

  /** What the profile menu shows permanently, under the list (spec §16.6). */
  const status = $derived(profileStatus(profile, config.keys.length, health));
  const statusWarn = $derived(health.problem !== null || health.dropped > 0);

  /**
   * Opens a profile, and puts the overlay on it.
   *
   * The broadcast is not optional: OBS is showing the previous profile's keys
   * and nothing about switching would reach it otherwise.
   */
  function openProfile(name: string) {
    profiles.select(name);
    profile = name;
    profileNames = profiles.list();

    const next = profiles.load(name);
    health = { problem: next.problem, dropped: next.dropped, from: 'load' };
    config = next.config;
    broadcaster.publish(config);

    return loadToast(next.problem);
  }

  function switchProfile(name: string) {
    toast = openProfile(name);
  }

  function createProfile(name: string) {
    // `create` returns the name it really took: asking for one that exists
    // gets "Apex 2" rather than the layout that was already there.
    const created = profiles.create(name);
    openProfile(created);
    toast = { tone: 'success', message: `Profile “${created}” created` };
  }

  function duplicateProfile() {
    // Saved first: `duplicate` copies what is in storage, and the difference
    // would be exactly whatever has not been written yet.
    profiles.save(profile, config);
    const copy = profiles.duplicate(profile);
    openProfile(copy);
    toast = { tone: 'success', message: `Duplicated to “${copy}”` };
  }

  function renameProfile(name: string) {
    // Nothing is loaded or broadcast: the configuration did not change, only
    // the name it is filed under. Reopening it here would push an identical
    // profile back at OBS for no reason.
    if (!profiles.rename(profile, name)) {
      toast = { tone: 'error', message: `A profile named “${name}” already exists` };
      return;
    }

    profile = name;
    profileNames = profiles.list();
    toast = { tone: 'success', message: `Renamed to “${name}”` };
  }

  function removeProfile() {
    const gone = profile;
    profiles.remove(gone);
    openProfile(profiles.active());
    toast = { tone: 'success', message: `Profile “${gone}” deleted` };
  }

  /**
   * What the gate over "Add key" offers to press.
   *
   * Without permission the missing thing is a *click* — WebHID has nothing to
   * hang its prompt on until one arrives — so the gate has to offer one. This
   * is the only place left doing so once the setup wizard is gone for good,
   * and dropping it in the task 27 rewrite left the page with no way at all to
   * grant access. On an unsupported browser nothing is offered: a button that
   * cannot help is how someone presses it four times.
   */
  const keyboardAction = $derived(
    keyboardStatus === 'no-permission' ? 'Allow keyboard' : 'Rescan devices',
  );

  /**
   * Whether the global style has been touched at all — §9.3's marker.
   *
   * Not applied to the port and password, which the fold above once carried:
   * a password is mandatory for the thing to work, so the dot would be lit
   * from the first minute and for ever. A marker that is always on says
   * nothing, and teaches people to stop reading markers.
   */
  const styled = $derived(STYLE_KEYS.some((key) => config.style[key] !== DEFAULT_STYLE[key]));

  let urlCopied = $state(false);

  async function copyUrl() {
    await navigator.clipboard?.writeText(url);
    urlCopied = true;
    note('user', 'Overlay URL copied.');
  }

  function downloadProfile() {
    const blob = new Blob([exportConfig(config)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), {
      href,
      // A profile name is free text and lands in a file name: anything a path
      // could read as a separator becomes a dash.
      download: `he-overlay-${profile.replace(/[^\w.-]+/g, '-')}.json`,
    });
    link.click();
    URL.revokeObjectURL(href);
  }

  async function importProfile(file: File) {
    let text: string;
    try {
      // `File.text()` rejects when the file moved, changed, or sat on a volume
      // that went away between the picker closing and the read. Unhandled, the
      // rejection belongs to nobody: no message, and nothing to retry against.
      text = await file.text();
    } catch {
      toast = READ_FAILED;
      return;
    }

    const result = importConfig(text);
    toast = importToast(result);
    // Nothing is lost on a failure: the open profile is untouched, and the
    // toast is the only thing that changes. The permanent line still describes
    // what is actually loaded.
    if (!result.ok) return;

    health = { problem: null, dropped: result.dropped, from: 'import' };
    updateConfig(result.config);
  }

  /**
   * One warning per anomaly kind and per session. A wrong assumption about
   * report length would otherwise emit `bad-length` on every single report —
   * hundreds a second, enough to lock up the devtools. The readable log is
   * task 26.
   */
  const warned = new Set<DecodeAnomaly['kind']>();

  function warnOnce(anomaly: DecodeAnomaly) {
    if (warned.has(anomaly.kind)) return;
    warned.add(anomaly.kind);
    note('bug', describeAnomaly(anomaly));
  }

  const session = createCaptureSession({
    // Indirection through the current client: the session outlives any single
    // connection, and keeps working across a port or password change.
    obs: {
      broadcast: (message) => obs.broadcast(message),
      ensureConnected: (now) => obs.ensureConnected(now),
    },
    // Only the configured keys travel: the overlay filters nothing (spec §6).
    selectedIds: () => config.keys.map((key) => key.id),
    onEntries: (entries) => {
      // Before the learning guard: a key is watched from the moment it is
      // seen, not from the moment someone happens to be adding one.
      if (suggester.observe(entries)) observed += 1;
      if (!learning) return;
      const learned = pickLearned(entries);
      if (!learned) return;
      // One key per activation: the mode closes itself, so holding the key
      // down cannot add it a second time.
      learning = false;
      const next = addLearnedKey(config, learned, activeLayout);
      // Read from the result, not from the report: the label is the layout's
      // business, and the wizard's third step names the key it just saw.
      const before = config.keys.map((key) => key.id);
      lastKey = next.keys.find((key) => !before.includes(key.id))?.label ?? null;
      updateConfig(next);
    },
    onKeys: (k) => {
      frame = k;
      rate = session.rate;
      // Refreshed here, not in the report handler: this runs at the emission
      // rate, which is bounded, and nothing about the figures needs to be
      // fresher than what the eye can read.
      if (probing) probeReading = streamProbe.reading();
      // Expiry is computed on read, so an overlay that went away only stops
      // being counted once something asks. Without this it would linger until
      // another overlay beats — and if it was the only one, forever.
      refreshOverlays();
    },
    onAnomaly: warnOnce,
  });

  const link = createKeyboardLink({
    hid: navigator.hid,
    onReport: (data, timestamp) => {
      // The only place the raw bytes exist. Latched once: an unknown keyboard
      // is identified from one report, and rewriting it a thousand times a
      // second would leave nothing readable on screen.
      if (capturing) {
        snapshot = hexDump(data);
        capturing = false;
        note('user', 'Raw report captured.');
      }
      streamProbe.observe(timestamp);
      session.handleReport(data, timestamp);
    },
    onStatus: (status, name) => {
      keyboardStatus = status;
      keyboardName = name;
      note('user', name === null ? `Keyboard: ${status}.` : `Keyboard: ${status} (${name}).`);
    },
  });

  // Nothing to do on switching the machine on (spec §10): a keyboard already
  // authorised resumes without a gesture, and the credentials come from the
  // previous session.
  void link.resume();
  obs.connect();
</script>

<!--
  The three zones of mockup board `6d`: a 50 px header, the stage, and a 300 px
  panel. Nothing here is a pile of collapsibles any more — the folds live in the
  panel's footer, where §9.3 still governs them.
-->
<div class="app">
  <header class="bar">
    <StatusBar keyboard={keyboardStatus} obs={obsStatus} {rate} overlays={overlayCount} />

    {#if canResume}
      <!-- Amber, and in the header: findable long after the card was put
           aside, from any screen (board 6f). -->
      <button class="resume" onclick={() => remember('open')}>
        <span class="dot" aria-hidden="true"></span>
        Resume setup · {stepNumber(step)}/3
      </button>
    {/if}

    <ProfileBar
      names={profileNames}
      active={profile}
      keyCount={(name) => profiles.keyCount(name)}
      {status}
      {statusWarn}
      onSelect={switchProfile}
      onCreate={createProfile}
      onDuplicate={duplicateProfile}
      onRename={renameProfile}
      onRemove={removeProfile}
      onExport={downloadProfile}
      onImport={importProfile}
    />
  </header>

  <div class="split">
    <main class="stage">
      {#if wizardOpen}
        <!-- On the stage, not beside it: the setup is an orchestration of the
             editor, not a second interface (spec §9.1). -->
        <div class="setup" class:banner={step === 'keys'}>
          <Wizard
            {step}
            keyboard={keyboardStatus}
            device={keyboardName}
            {settings}
            {url}
            bind:learning
            added={lastKey}
            onAllowKeyboard={() => link.requestPermission()}
            onReconnect={reconnect}
            onSkip={() => remember('skipped')}
          />
        </div>
      {/if}

      <!-- The same component OBS renders, from the same resolved shape — with
           the editor decorations on, which the broadcast never gets. -->
      <LayoutEditor
        {config}
        {frame}
        bind:selectedIds
        onChange={updateConfig}
        layout={activeLayout}
        suggestAxis={selectedIds.length === 1 && suggestedIds.includes(selectedIds[0]!)}
        onDismissSuggestion={() => {
          // Proposing a mode for a heterogeneous group would mean nothing, so
          // the suggestion is single-selection only — and so is dismissing it.
          suggester.dismiss(selectedIds[0]!);
          observed += 1;
        }}
      />
    </main>

    <aside class="panel">
      <section class="block">
        <Gated
          available={keyboardStatus === 'connected'}
          reason={keyboardHint(keyboardStatus)}
          action={keyboardStatus === 'unsupported' ? null : keyboardAction}
          onAction={() => link.requestPermission()}
        >
          <KeyLearner bind:learning onCancel={() => (learning = false)} />
        </Gated>
      </section>

      <!-- Before the style panel, as the lot of 2026-08-21 has it: while
           nothing works yet, the overlay URL is what one comes here for. -->
      <section class="block">
        <Collapsible
          id="obs"
          title="OBS browser source"
          note={overlayCount > 0 ? `${overlayCount} overlay` : null}
          defaultOpen
          {storage}
        >
          <Gated available={obsStatus === 'identified'} reason="Available once OBS is connected">
            <div class="url">
              <input readonly value={url} aria-label="Overlay URL for OBS" />
              <button class="link" onclick={copyUrl}>{urlCopied ? 'Copied' : 'Copy'}</button>
            </div>

            {#if config.keys.length > 0}
              <p class="figure">
                <span>Recommended source size</span>
                <span class="value">{size.width} × {size.height} px</span>
              </p>
            {/if}

            <p class="state">
              <span class="dot" data-live={overlayCount > 0} aria-hidden="true"></span>
              {overlayCount > 0
                ? 'Overlay connected · receiving frames'
                : 'No overlay has reported in yet'}
            </p>
          </Gated>

          <!-- Not in the mockup, which shows only the URL here and leaves the
               two fields to the wizard. They have to stay reachable once the
               setup is done and the wizard is gone for good. -->
          <label class="field">
            Port
            <input
              type="number"
              min="1"
              max={MAX_PORT}
              bind:value={settings.port}
              onchange={reconnect}
            />
          </label>
          <label class="field">
            Password
            <input type="password" bind:value={settings.password} onchange={reconnect} />
          </label>
          <p class="fine">
            Stored in this browser and carried in the URL above. Anyone with access to this machine
            can read it.
          </p>
        </Collapsible>
      </section>

      <!-- Global appearance. Per-key overrides live in the popover the editor
           anchors to the selection, never here (spec §16.4). -->
      <section class="block">
        <Collapsible id="style" title="Global style · all keys" modified={styled} {storage}>
          <StylePanel {config} onChange={updateConfig} />
        </Collapsible>
      </section>

      <section class="block keys-block">
        <Collapsible id="keys" title="Keys" note={String(config.keys.length)} defaultOpen {storage}>
          {#if config.keys.length === 0}
            <p class="fine">No keys yet.</p>
          {:else}
            <ul class="keys">
              {#each config.keys as key (key.id)}
                <li class:selected={selectedIds.includes(key.id)}>
                  <span class="label">{key.label}</span>
                  <span class="mode">{key.mode}</span>
                  {#if hasOverrides(key)}<span class="override">override</span>{/if}
                  <button
                    class="trash"
                    aria-label={'Delete ' + key.label}
                    onclick={() => updateConfig(removeKey(config, key.id))}
                  >
                    🗑
                  </button>
                </li>
              {/each}
            </ul>

            {#if selectedIds.length > 1}
              <button
                class="link"
                onclick={() => {
                  updateConfig(removeKeys(config, selectedIds));
                  selectedIds = [];
                }}
              >
                Delete {selectedIds.length} selected keys
              </button>
            {/if}
          {/if}
        </Collapsible>
      </section>

      <footer class="foot">
        <!-- Deliberately last and discreet: an edge case that matters only when
             detection got it wrong (spec §16.4, §8.6). -->
        <Collapsible
          id="layout"
          title="Keyboard layout"
          note={config.layoutOverride === 'auto' ? 'Auto' : config.layoutOverride.toUpperCase()}
          modified={config.layoutOverride !== 'auto'}
          {storage}
        >
          <select
            aria-label="Keyboard layout"
            value={config.layoutOverride}
            onchange={(event) =>
              updateConfig(
                setLayoutOverride(
                  config,
                  event.currentTarget.value as OverlayConfig['layoutOverride'],
                  layout,
                ),
              )}
          >
            <option value="auto">Auto — detected</option>
            <option value="azerty">AZERTY</option>
            <option value="qwerty">QWERTY</option>
            <option value="qwertz">QWERTZ</option>
          </select>
          <p class="fine">Only affects displayed labels · capture is layout-independent.</p>
        </Collapsible>

        <Collapsible
          id="diagnostics"
          title="Journal"
          note={toReport > 0 ? log.length + ' · ' + toReport + ' to report' : String(log.length)}
          warn={toReport > 0}
          {storage}
        >
          <Diagnostics
            entries={log}
            logText={() => journal.asText()}
            {readings}
            {snapshot}
            {capturing}
            {probing}
            probe={probeReading}
            {obsProbe}
            onCaptureRaw={() => (capturing = true)}
            onToggleProbe={toggleProbe}
            onTestObs={testObs}
          />
        </Collapsible>
      </footer>
    </aside>
  </div>
</div>

<Toast notice={toast} onDismiss={() => (toast = null)} />

<style>
  .app {
    display: flex;
    flex-direction: column;
    block-size: 100vh;
    font: var(--he-font, 400 17px system-ui, sans-serif);
    color: var(--he-text, #dde1e9);
    background: var(--he-bg, #0e1015);
  }

  .bar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 22px;
    block-size: var(--he-header-height, 50px);
    padding: 0 22px;
    border-block-end: 1px solid var(--he-border, #1b1e27);
  }
  .bar :global(header) {
    /* StatusBar brings its own header element; here it is a run of pills. */
    flex: 1;
    background: none;
    padding: 0;
  }
  .resume {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font: inherit;
    font-size: var(--he-size-md, 17px);
    font-weight: 600;
    color: var(--he-override, #d9a05b);
    background: none;
    border: 1px solid var(--he-override, #d9a05b);
    border-radius: var(--he-radius-control, 5px);
    padding: 5px 11px;
    cursor: pointer;
  }
  .resume .dot {
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    background: var(--he-override, #d9a05b);
  }

  .split {
    flex: 1;
    display: flex;
    min-block-size: 0;
  }

  .stage {
    flex: 1;
    position: relative;
    min-inline-size: 0;
    background: var(--he-stage, #0b0d11);
  }
  /* Over the editor, because the setup is walking someone through it. The
     third step is a banner at the top instead: a card in the middle would
     cover the very keys it is asking for (board 6c). */
  .setup {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    /* The wrapper spans the stage so the card can be centred in it; without
       this it would also swallow every click meant for the keys underneath. */
    pointer-events: none;
  }
  .setup > :global(*) {
    pointer-events: auto;
  }
  /* The third step is a banner at the top: a card in the middle would cover
     the very keys the step is asking for (board 6c). */
  .setup.banner {
    align-items: start;
    padding-block-start: 52px;
  }

  .panel {
    flex: none;
    inline-size: var(--he-panel-width, 300px);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    border-inline-start: 1px solid var(--he-border, #1b1e27);
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 10px 18px;
    border-block-end: 1px solid var(--he-border, #1b1e27);
  }
  /* The one section worth the leftover room: folding the others is what this
     is for. */
  .keys-block {
    flex: 1;
    min-block-size: 0;
    overflow-y: auto;
  }
  .foot {
    margin-block-start: auto;
    display: flex;
    flex-direction: column;
    padding: 11px 18px;
    border-block-start: 1px solid var(--he-border, #1b1e27);
    background: var(--he-stage, #0b0d11);
  }

  .url {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    background: var(--he-stage, #0b0d11);
    border: 1px solid var(--he-border-control, #232838);
    border-radius: var(--he-radius, 4px);
  }
  .url input {
    flex: 1;
    min-inline-size: 0;
    border: none;
    background: none;
    padding: 0;
    font: var(--he-font-mono, 400 15px ui-monospace, monospace);
    font-size: var(--he-size-xs, 14px);
    color: var(--he-text-faint, #5a5f70);
    text-overflow: ellipsis;
  }
  .link {
    all: unset;
    cursor: pointer;
    font-size: var(--he-size-sm, 15.5px);
    font-weight: 600;
    color: var(--he-accent, #7c9eff);
  }
  .link:hover {
    color: var(--he-accent-hover, #a5bcff);
  }
  .link:focus-visible {
    outline: 2px solid var(--he-accent, #7c9eff);
    outline-offset: 2px;
  }

  .figure,
  .state,
  .fine {
    margin: 0;
    font-size: var(--he-size-xs, 14px);
    color: var(--he-text-faint, #5a5f70);
    line-height: 1.45;
  }
  .figure {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 9px;
    background: var(--he-surface, #151823);
    border-radius: var(--he-radius, 4px);
  }
  .figure .value {
    font: var(--he-font-mono, 400 15px ui-monospace, monospace);
    font-size: var(--he-size-xs, 14px);
    color: var(--he-text, #dde1e9);
  }
  .state {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .state .dot {
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    background: var(--he-border-hover, #3a4054);
  }
  .state .dot[data-live='true'] {
    background: var(--he-ok, #4caf7d);
  }

  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: var(--he-size-sm, 15.5px);
    color: var(--he-text-muted, #8b90a0);
    padding-block: 3px;
  }
  .field input {
    inline-size: 8rem;
    font: var(--he-font-mono, 400 15px ui-monospace, monospace);
    font-size: var(--he-size-sm, 15.5px);
    color: var(--he-text, #dde1e9);
    background: var(--he-stage, #0b0d11);
    border: 1px solid var(--he-border-control, #232838);
    border-radius: var(--he-radius, 4px);
    padding: 4px 7px;
  }

  .keys {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .keys li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 9px;
    border-radius: var(--he-radius, 4px);
    font-size: var(--he-size-md, 17px);
  }
  .keys li:hover {
    background: var(--he-surface, #151823);
  }
  .keys li.selected {
    background: var(--he-surface, #151823);
  }
  .label {
    font-weight: 600;
    min-inline-size: 2.5rem;
  }
  .mode {
    font-size: var(--he-size-xs, 14px);
    color: var(--he-text-faint, #5a5f70);
  }
  .override {
    font-size: var(--he-size-xs, 14px);
    color: var(--he-override, #d9a05b);
  }
  .trash {
    all: unset;
    margin-left: auto;
    cursor: pointer;
    font-size: var(--he-size-sm, 15.5px);
    opacity: 0;
  }
  .keys li:hover .trash,
  .trash:focus-visible {
    opacity: 1;
  }
  .trash:focus-visible {
    outline: 2px solid var(--he-accent, #7c9eff);
    outline-offset: 2px;
  }

  select {
    font: inherit;
    font-size: var(--he-size-md, 17px);
    color: var(--he-text, #dde1e9);
    background: var(--he-stage, #0b0d11);
    border: 1px solid var(--he-border-control, #232838);
    border-radius: var(--he-radius, 4px);
    padding: 4px 6px;
  }
</style>
