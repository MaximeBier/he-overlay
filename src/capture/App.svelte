<script lang="ts">
  import { untrack } from 'svelte';
  import { createKeyboardLink, type KeyboardStatus } from '../keyboard/device';
  import {
    createObsClient,
    MAX_PORT,
    normalizePort,
    type ObsClient,
    type ObsStatus,
  } from '../transport/obs';
  import { createCaptureSession } from './session';
  import { loadSettings, saveSettings, overlayUrl, browserStorage } from './settings';
  import { createOverlayRegistry } from './overlays';
  import { createConfigBroadcaster } from './broadcast';
  import { addLearnedKey, pickLearned, removeKey, removeKeys } from './learn';
  import { loadLayoutMap, resolveLayout, type LayoutMapLike } from '../keyboard/labels';
  import { setLayoutOverride } from '../config/edit';
  import { createAxisSuggester } from './suggest';
  import { resolve } from '../config/resolve';
  import { recommendedSize } from '../view/scene';
  import KeyLearner from './KeyLearner.svelte';
  import LayoutEditor from './LayoutEditor.svelte';
  import StylePanel from './StylePanel.svelte';
  import { createProfileStore, exportConfig, importConfig } from '../config/storage';
  import type { OverlayConfig } from '../config/schema';
  import StatusBar from './StatusBar.svelte';
  import Wizard from './Wizard.svelte';
  import Diagnostics from './Diagnostics.svelte';
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
  let logOpen = $state(false);

  function note(kind: 'user' | 'bug', message: string) {
    journal.add(kind, message, performance.now());
    log = journal.entries();
  }

  /**
   * The live reading, computed only while someone is looking.
   *
   * It follows `frame`, which arrives up to sixty times a second. A shut
   * panel that kept recomputing would make the capture page compete with its
   * own broadcast, for a list nobody can see.
   */
  const readings = $derived.by(() => {
    if (!logOpen) return [];
    return config.keys.map((key) => {
      const seen = frame.find(([id]) => id === key.id);
      return { id: key.id, label: key.label, travel: seen?.[1] ?? 0, active: seen?.[2] === 1 };
    });
  });

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

<div class="top">
  <StatusBar keyboard={keyboardStatus} obs={obsStatus} {rate} overlays={overlayCount} />
  {#if canResume}
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
</div>

<Toast notice={toast} onDismiss={() => (toast = null)} />

<main>
  <h1>HE Overlay — Capture</h1>

  {#if wizardOpen}
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
  {/if}

  <button onclick={() => link.requestPermission()}>Allow keyboard</button>

  <label>
    OBS port
    <input type="number" min="1" max={MAX_PORT} bind:value={settings.port} onchange={reconnect} />
  </label>
  <label>
    OBS password
    <input type="password" bind:value={settings.password} onchange={reconnect} />
  </label>
  <p class="warning">
    The password is stored in this browser and travels in the overlay URL below. Anyone with access
    to this machine can read it.
  </p>

  <label>
    Overlay URL for OBS
    <input readonly value={url} />
  </label>

  {#if config.keys.length > 0}
    <p class="quiet">
      Recommended source size: <code>{size.width} × {size.height}</code> — the overlay pulls the keys
      into the top-left corner, so this is smaller than the editor stage.
    </p>
  {/if}

  <div class="row">
    <KeyLearner bind:learning onCancel={() => (learning = false)} />
  </div>

  <!-- The same component OBS renders, from the same resolved shape — with the
       editor decorations on, which the broadcast never gets. -->
  <LayoutEditor
    {config}
    {frame}
    bind:selectedIds
    onChange={updateConfig}
    layout={activeLayout}
    suggestAxis={selectedIds.length === 1 && suggestedIds.includes(selectedIds[0]!)}
    onDismissSuggestion={() => {
      // Proposing a mode for a heterogeneous group would mean nothing, so the
      // suggestion is single-selection only — and so is dismissing it.
      suggester.dismiss(selectedIds[0]!);
      observed += 1;
    }}
  />

  <!-- Global appearance. Per-key overrides live in the popover the editor
       anchors to the selection, never here (spec §16.4). -->
  <StylePanel {config} onChange={updateConfig} />

  <!-- Deliberately discreet, and placed last: an edge case that matters only
       when detection got it wrong (spec §16.4, §8.6). Changing it relabels the
       keys already added — that is what it is for. -->
  <label class="quiet">
    Keyboard layout
    <select
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
  </label>

  {#if config.keys.length > 0}
    <ul class="keys">
      {#each config.keys as key (key.id)}
        <li>
          <span class="label">{key.label}</span>
          <span class="index">index {key.id}</span>
          <button onclick={() => updateConfig(removeKey(config, key.id))}>Remove</button>
        </li>
      {/each}
    </ul>

    {#if selectedIds.length > 1}
      <!-- Under the list, not in the editor: the popover already deletes the
           selection, and a second button on the stage would sit next to it
           saying the same thing (spec §16.4). -->
      <button
        onclick={() => {
          updateConfig(removeKeys(config, selectedIds));
          selectedIds = [];
        }}
      >
        Delete {selectedIds.length} selected keys
      </button>
    {/if}
  {/if}
</main>

<!-- Last, and shut: the rarest thing on the page. Task 27 moves it to the foot
     of the sidebar, where the mockup puts it. -->
<Diagnostics
  bind:open={logOpen}
  entries={log}
  logText={journal.asText()}
  {readings}
  {snapshot}
  {capturing}
  {probing}
  probe={probeReading}
  onCaptureRaw={() => (capturing = true)}
  onToggleProbe={toggleProbe}
/>

<style>
  main {
    font: var(--he-font, 400 14px system-ui, sans-serif);
    padding: 0.75rem;
    display: grid;
    gap: 0.5rem;
    justify-items: start;
  }
  .warning {
    color: var(--he-override);
    margin: 0;
  }
  .row {
    display: flex;
    gap: var(--he-space, 0.5rem);
    align-items: center;
    flex-wrap: wrap;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding-right: 0.75rem;
    background: var(--he-surface);
  }
  .top :global(header) {
    flex: 1;
  }
  /* Amber, and in the header: it has to be findable long after the card was
     put aside, from any screen (board 6f). */
  .resume {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font: inherit;
    font-size: 12px;
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
  .keys {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  .keys li {
    display: flex;
    gap: var(--he-space, 0.5rem);
    align-items: center;
  }
  .label {
    min-width: 4rem;
    font-weight: 700;
  }
  .quiet {
    display: flex;
    gap: var(--he-space, 0.5rem);
    align-items: center;
    font-size: 12px;
    color: var(--he-text-muted, #8b90a0);
  }
  .index {
    color: var(--he-text-muted, #8b90a0);
  }
  input[readonly] {
    min-width: 32rem;
    max-width: 100%;
  }
</style>
