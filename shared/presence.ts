/**
 * Counts how many holders claim something, and reports only when it starts or stops being held.
 * Each claim returns its own release; releasing twice counts once.
 */
export interface Presence {
  claim(): () => void;
  held(): boolean;
}

export function createPresence(onChange: (held: boolean) => void): Presence {
  let count = 0;
  return {
    claim() {
      count += 1;
      if (count === 1) onChange(true);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        count -= 1;
        if (count === 0) onChange(false);
      };
    },
    held: () => count > 0,
  };
}
