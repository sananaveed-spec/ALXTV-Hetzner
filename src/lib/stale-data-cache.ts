export function createStaleCache<T>() {
  let last: T | null = null;

  return {
    get(): T | null {
      return last;
    },
    set(value: T): void {
      last = value;
    },
  };
}
