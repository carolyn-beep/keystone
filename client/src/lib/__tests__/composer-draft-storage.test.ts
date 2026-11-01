/**
 * FR1 — composer-draft-storage behavior tests.
 *
 * These are real behavior tests (not source-string assertions) because the
 * storage helper is a pure module with deterministic side effects on
 * `window.localStorage`. The repo's vitest config uses `environment: 'node'`,
 * so we install a minimal in-memory `localStorage` shim onto `globalThis.window`
 * in `beforeEach` and tear it down in `afterEach`.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

type StorageShim = {
  store: Record<string, string>;
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
};

function installLocalStorage(): StorageShim {
  const store: Record<string, string> = {};
  const shim: StorageShim = {
    store,
    getItem: vi.fn((key: string) =>
      Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    ),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
  };
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => shim.getItem(k),
      setItem: (k: string, v: string) => shim.setItem(k, v),
      removeItem: (k: string) => shim.removeItem(k),
    },
  };
  return shim;
}

function uninstallLocalStorage() {
  delete (globalThis as any).window;
}

// Import after the shim helpers are defined; the module itself only reads
// `window` lazily at call time so import order doesn't actually matter.
import {
  clear,
  keyFor,
  read,
  write,
} from '../composer-draft-storage';

describe('FR1 composer-draft-storage / keyFor', () => {
  it('returns `chat-composer-draft:new` for null', () => {
    expect(keyFor(null)).toBe('chat-composer-draft:new');
  });

  it('returns `chat-composer-draft:0` for 0 (must NOT conflate with null)', () => {
    expect(keyFor(0)).toBe('chat-composer-draft:0');
  });

  it('returns `chat-composer-draft:42` for numeric ids', () => {
    expect(keyFor(42)).toBe('chat-composer-draft:42');
  });
});

describe('FR1 composer-draft-storage / read', () => {
  let shim: StorageShim;

  beforeEach(() => {
    shim = installLocalStorage();
  });

  afterEach(() => {
    uninstallLocalStorage();
  });

  it('returns the stored value for a numeric id', () => {
    shim.store['chat-composer-draft:42'] = 'hello';
    expect(read(42)).toBe('hello');
  });

  it('returns the stored value for null (the :new key)', () => {
    shim.store['chat-composer-draft:new'] = 'wip';
    expect(read(null)).toBe('wip');
  });

  it('returns null when the key is missing', () => {
    expect(read(99)).toBeNull();
  });

  it('returns null when the stored value is an empty string', () => {
    shim.store['chat-composer-draft:7'] = '';
    expect(read(7)).toBeNull();
  });

  it('swallows getItem throws and returns null', () => {
    shim.getItem.mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => read(1)).not.toThrow();
    expect(read(1)).toBeNull();
  });
});

describe('FR1 composer-draft-storage / write', () => {
  let shim: StorageShim;

  beforeEach(() => {
    shim = installLocalStorage();
  });

  afterEach(() => {
    uninstallLocalStorage();
  });

  it('writes the text under the numeric-id key', () => {
    write(42, 'hello');
    expect(shim.store['chat-composer-draft:42']).toBe('hello');
  });

  it('writes the text under the :new key when scope is null', () => {
    write(null, 'draft text');
    expect(shim.store['chat-composer-draft:new']).toBe('draft text');
  });

  it('clears the key when text is the empty string', () => {
    shim.store['chat-composer-draft:42'] = 'old';
    write(42, '');
    expect(shim.store['chat-composer-draft:42']).toBeUndefined();
    expect(shim.removeItem).toHaveBeenCalledWith('chat-composer-draft:42');
  });

  it('clears the key when text is whitespace-only', () => {
    shim.store['chat-composer-draft:42'] = 'old';
    write(42, '   \n\t');
    expect(shim.store['chat-composer-draft:42']).toBeUndefined();
  });

  it('does NOT call setItem when text is whitespace-only', () => {
    write(42, '   ');
    expect(shim.setItem).not.toHaveBeenCalled();
  });

  it('swallows setItem throws', () => {
    shim.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => write(42, 'x')).not.toThrow();
  });
});

describe('FR1 composer-draft-storage / clear', () => {
  let shim: StorageShim;

  beforeEach(() => {
    shim = installLocalStorage();
  });

  afterEach(() => {
    uninstallLocalStorage();
  });

  it('removes the key', () => {
    shim.store['chat-composer-draft:42'] = 'x';
    clear(42);
    expect(shim.store['chat-composer-draft:42']).toBeUndefined();
    expect(shim.removeItem).toHaveBeenCalledWith('chat-composer-draft:42');
  });

  it('is a no-op when the key is missing', () => {
    expect(() => clear(99)).not.toThrow();
  });

  it('swallows removeItem throws', () => {
    shim.removeItem.mockImplementation(() => {
      throw new Error('fail');
    });
    expect(() => clear(42)).not.toThrow();
  });
});

describe('FR1 composer-draft-storage / SSR safety', () => {
  beforeEach(() => {
    uninstallLocalStorage();
  });

  it('read returns null when window is undefined', () => {
    expect(read(42)).toBeNull();
  });

  it('write is a no-op when window is undefined', () => {
    expect(() => write(42, 'x')).not.toThrow();
  });

  it('clear is a no-op when window is undefined', () => {
    expect(() => clear(42)).not.toThrow();
  });

  it('keyFor still works when window is undefined (pure)', () => {
    expect(keyFor(42)).toBe('chat-composer-draft:42');
  });
});
