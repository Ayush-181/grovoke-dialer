type ShortcutEvent = {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing: boolean;
  defaultPrevented: boolean;
};

// Never turn typing, IME composition, key repeats or modal interaction into a call action.
export function shortcutCommand(event: ShortcutEvent, editing: boolean, dialogOpen: boolean) {
  if (
    editing ||
    dialogOpen ||
    event.repeat ||
    event.isComposing ||
    event.defaultPrevented ||
    event.ctrlKey ||
    event.metaKey
  )
    return null;
  if (event.altKey) {
    if (event.shiftKey) return null;
    return (
      (
        {
          d: "dial",
          h: "hold",
          m: "mute",
          n: "notes",
          b: "book",
          Enter: "save-next",
          ArrowLeft: "previous",
        } as Record<string, string>
      )[event.key.length === 1 ? event.key.toLowerCase() : event.key] ?? null
    );
  }
  if (event.key === "?") return "help";
  return /^\d$/.test(event.key) && !event.shiftKey ? `outcome-${event.key}` : null;
}
