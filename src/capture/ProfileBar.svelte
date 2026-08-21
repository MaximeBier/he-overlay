<script lang="ts">
  import { keysLabel } from './notice';

  /**
   * The profile menu of mockup board `6d`: the list with its key counts, then
   * making profiles, then the file on disk, then the line that stays.
   *
   * It owns no configuration and reads no storage. Every row reports upwards
   * and waits — which is what lets the store stay the only thing that knows
   * what a profile is.
   */
  let {
    names,
    active,
    keyCount,
    status,
    statusWarn = false,
    onSelect,
    onCreate,
    onDuplicate,
    onRename,
    onRemove,
    onExport,
    onImport,
  }: {
    names: readonly string[];
    active: string;
    /**
     * Read on render, not held: counts come from storage, which nothing here
     * observes. The menu is rebuilt on every open, and a profile cannot change
     * while it is the only thing on screen.
     */
    keyCount: (name: string) => number;
    status: string;
    /** Amber, per the mockup: a fact worth keeping visible, not just readable. */
    statusWarn?: boolean;
    onSelect: (name: string) => void;
    onCreate: (name: string) => void;
    onDuplicate: () => void;
    onRename: (name: string) => void;
    onRemove: () => void;
    onExport: () => void;
    onImport: (file: File) => void;
  } = $props();

  let open = $state(false);
  /**
   * Which name is being typed, if any.
   *
   * One field for both, and never two: with a rename and a creation open at
   * once, submitting the wrong one renames the profile that is loaded.
   */
  let editing = $state<'new' | 'rename' | null>(null);
  let confirming = $state(false);
  let root = $state<HTMLElement | null>(null);
  let nameField = $state<HTMLInputElement | null>(null);

  function close() {
    open = false;
    // Both are one-shot states that only make sense inside a session with the
    // menu. Left standing, reopening shows a half-typed name, or an armed
    // delete two clicks from a layout nobody meant to lose.
    editing = null;
    confirming = false;
  }

  function toggle() {
    if (open) close();
    else open = true;
  }

  /** Acts, then closes — in that order, so the callback still reads the menu's state. */
  function act(run: () => void) {
    run();
    close();
  }

  function submitName(event: SubmitEvent) {
    event.preventDefault();
    const name = nameField?.value.trim() ?? '';
    // The store would name a blank creation "Profile" for us, and refuse a
    // blank rename. Doing nothing is the better answer to both: nobody submits
    // an empty name on purpose.
    if (!name) return;

    act(() => (editing === 'rename' ? onRename(name) : onCreate(name)));
  }

  /**
   * Escape gives up the field, not the menu.
   *
   * The document listener that closes the menu sees this key too, so the event
   * is stopped here: one Escape to abandon the name being typed, a second to
   * close — which is what every other text field in a menu does.
   */
  function cancelName(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    editing = null;
  }

  function remove() {
    // Deleting a profile is the one action here that destroys work nothing can
    // recover. The row asks again rather than opening a dialog: the question
    // belongs where the click was.
    if (!confirming) {
      confirming = true;
      return;
    }
    act(onRemove);
  }

  function pick(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Cleared either way, or picking the same file twice fires nothing — which
    // is exactly what someone does after fixing it by hand.
    input.value = '';
    if (file) act(() => onImport(file));
  }

  // Focus follows the field into existence: the row was clicked to type in it,
  // and a rename hands over a selected name rather than a caret in the middle
  // of one. `editing` is read so that swapping modes refocuses the same node.
  $effect(() => {
    void editing;
    nameField?.select();
  });

  $effect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    // `pointerdown`, not `click`: the menu must be gone before whatever was
    // clicked underneath it reacts. The trigger is inside `root`, so its own
    // click still reaches `toggle` and closes it there.
    const onPointer = (event: PointerEvent) => {
      if (!root?.contains(event.target as Node)) close();
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  });
</script>

<div class="profile" bind:this={root}>
  <span class="caption">Profile</span>
  <button
    class="trigger"
    data-trigger
    type="button"
    aria-expanded={open}
    aria-haspopup="menu"
    onclick={toggle}
  >
    {active}
    <span class="caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
  </button>

  {#if open}
    <div class="menu" data-menu role="menu" tabindex="-1">
      {#each names as name (name)}
        <button
          class="row"
          class:current={name === active}
          data-profile={name}
          type="button"
          role="menuitemradio"
          aria-checked={name === active}
          aria-current={name === active ? 'true' : undefined}
          onclick={() => act(() => name !== active && onSelect(name))}
        >
          <span class="name">{name}</span>
          {#if name === active}
            <span class="tick" aria-hidden="true">✓</span>
          {:else}
            <span class="count">{keysLabel(keyCount(name))}</span>
          {/if}
        </button>
      {/each}

      <hr />

      {#if editing}
        <form onsubmit={submitName}>
          <input
            bind:this={nameField}
            data-name-field
            type="text"
            value={editing === 'rename' ? active : ''}
            placeholder="Profile name"
            aria-label={editing === 'rename' ? 'Rename this profile' : 'New profile name'}
            onkeydown={cancelName}
          />
        </form>
      {:else}
        <button
          class="row"
          data-action="new"
          type="button"
          role="menuitem"
          onclick={() => (editing = 'new')}
        >
          New profile…
        </button>
      {/if}

      <button
        class="row"
        data-action="duplicate"
        type="button"
        role="menuitem"
        onclick={() => act(onDuplicate)}
      >
        Duplicate “{active}”
      </button>

      <!-- Not in the mockup either, which leaves "profile rename inline" to a
           later exploration. It reuses the field the creation row opens: one
           field, one meaning, and no second way to type a name. -->
      {#if !editing}
        <button
          class="row"
          data-action="rename"
          type="button"
          role="menuitem"
          onclick={() => (editing = 'rename')}
        >
          Rename “{active}”…
        </button>
      {/if}

      <!-- Not in the mockup, which offers no way out of a profile at all:
           created, duplicated and imported profiles would pile up with nothing
           to remove them. -->
      {#if names.length > 1}
        <button
          class="row danger"
          class:armed={confirming}
          data-action="remove"
          type="button"
          role="menuitem"
          onclick={remove}
        >
          {confirming ? `Really delete “${active}”?` : `Delete “${active}”`}
        </button>
      {/if}

      <hr />

      <!-- A real label around a real file input: no click forwarding, and the
           keyboard reaches the picker the way it reaches everything else. -->
      <label class="row">
        Import JSON…
        <input class="file" type="file" accept="application/json" onchange={pick} />
      </label>

      <button
        class="row"
        data-action="export"
        type="button"
        role="menuitem"
        onclick={() => act(onExport)}
      >
        Export “{active}” as JSON
      </button>

      {#if status}
        <span class="status" class:warn={statusWarn}>{status}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .profile {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font: var(--he-font, 400 17px system-ui, sans-serif);
    font-size: var(--he-size-md, 17px);
    color: var(--he-text-muted, #8b90a0);
  }
  .trigger {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 600;
    color: var(--he-text, #dde1e9);
    border-radius: var(--he-radius, 4px);
  }
  .caret {
    font-size: var(--he-size-xs, 14px);
    color: var(--he-text-muted, #8b90a0);
  }

  .menu {
    position: absolute;
    top: 30px;
    right: 0;
    z-index: 9;
    inline-size: 198px;

    display: flex;
    flex-direction: column;
    padding: 6px;

    background: var(--he-popover, #141722);
    border: 1px solid var(--he-border-popover, #262b3a);
    border-radius: var(--he-radius-panel, 6px);
  }
  .menu:focus {
    outline: none;
  }

  .row {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 9px;
    border-radius: var(--he-radius, 4px);
    font-size: var(--he-size-md, 17px);
    color: var(--he-text-muted, #8b90a0);
  }
  .row:hover,
  .row:focus-visible {
    background: var(--he-surface, #151823);
    color: var(--he-text, #dde1e9);
  }
  .row.current {
    font-weight: 600;
    color: var(--he-text, #dde1e9);
    background: var(--he-surface, #151823);
    cursor: default;
  }
  .row.danger {
    color: var(--he-danger, #e06c5b);
  }
  .row.danger.armed {
    font-weight: 600;
    background: var(--he-surface, #151823);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tick {
    color: var(--he-accent, #7c9eff);
  }
  .count {
    flex: none;
    font-size: var(--he-size-xs, 14px);
    color: var(--he-text-faint, #5a5f70);
  }

  hr {
    inline-size: auto;
    block-size: 1px;
    margin: 5px 4px;
    border: none;
    background: var(--he-border, #1b1e27);
  }

  form {
    padding: 3px 4px;
  }
  input[type='text'] {
    inline-size: 100%;
    box-sizing: border-box;
    font: inherit;
    font-size: var(--he-size-md, 17px);
    color: var(--he-text, #dde1e9);
    background: var(--he-stage, #0b0d11);
    border: 1px solid var(--he-border-control, #232838);
    border-radius: var(--he-radius, 4px);
    padding: 5px 8px;
  }
  input[type='text']:focus-visible {
    outline: 1px solid var(--he-accent, #7c9eff);
  }

  /* Hidden from sight, not from the keyboard: `display: none` would take the
     picker out of the tab order and leave the label pointing at nothing. */
  .file {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .status {
    padding: 3px 9px 4px;
    font-size: var(--he-size-xs, 14px);
    line-height: 1.4;
    color: var(--he-text-faint, #5a5f70);
  }
  .status.warn {
    color: var(--he-override, #d9a05b);
  }
</style>
