/* Storage wrapper: IndexedDB first, localStorage fallback. Same small async API either way.
 *   DB.get(store, key)  DB.getAll(store)  DB.put(store, value)  DB.delete(store, key)
 *   DB.exportAll()  DB.backend  ('indexeddb' | 'localstorage')
 */
const DB = (() => {
  const NAME = 'workout-app';
  const VERSION = 2; // 2: body (weigh-ins)
  const STORES = {
    settings: { keyPath: 'key' },
    progression: { keyPath: 'ladderId' },
    workouts: { keyPath: 'id' },
    logs: { keyPath: 'id', autoIncrement: true, indexes: [['date', 'date']] },
    body: { keyPath: 'id', autoIncrement: true, indexes: [['date', 'date']] },
  };

  let impl = null;
  let ready = null;

  // ---------- IndexedDB ----------
  function openIDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('no indexedDB'));
      const timer = setTimeout(() => reject(new Error('indexedDB open timed out')), 4000);
      let req;
      try { req = indexedDB.open(NAME, VERSION); } catch (e) { clearTimeout(timer); return reject(e); }
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, opts] of Object.entries(STORES)) {
          if (db.objectStoreNames.contains(name)) continue;
          const os = db.createObjectStore(name, { keyPath: opts.keyPath, autoIncrement: !!opts.autoIncrement });
          for (const [idx, path] of opts.indexes || []) os.createIndex(idx, path);
        }
      };
      req.onsuccess = () => { clearTimeout(timer); resolve(req.result); };
      req.onerror = () => { clearTimeout(timer); reject(req.error); };
      req.onblocked = () => { clearTimeout(timer); reject(new Error('indexedDB blocked')); };
    });
  }

  function idbImpl(db) {
    const tx = (store, mode, fn) => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
    return {
      backend: 'indexeddb',
      get: (s, k) => tx(s, 'readonly', os => os.get(k)),
      getAll: (s) => tx(s, 'readonly', os => os.getAll()),
      put: (s, v) => tx(s, 'readwrite', os => os.put(v)),
      delete: (s, k) => tx(s, 'readwrite', os => os.delete(k)),
    };
  }

  // ---------- localStorage fallback ----------
  function lsImpl() {
    const keyOf = s => `${NAME}:${s}`;
    const load = s => { try { return JSON.parse(localStorage.getItem(keyOf(s))) || {}; } catch { return {}; } };
    const save = (s, data) => localStorage.setItem(keyOf(s), JSON.stringify(data));
    return {
      backend: 'localstorage',
      async get(s, k) { return load(s)[k]; },
      async getAll(s) { return Object.values(load(s)); },
      async put(s, v) {
        const opts = STORES[s];
        const data = load(s);
        v = { ...v };
        if (v[opts.keyPath] == null && opts.autoIncrement) {
          const seq = Number(localStorage.getItem(keyOf(s) + ':seq') || 0) + 1;
          localStorage.setItem(keyOf(s) + ':seq', String(seq));
          v[opts.keyPath] = seq;
        }
        data[v[opts.keyPath]] = v;
        save(s, data);
        return v[opts.keyPath];
      },
      async delete(s, k) { const data = load(s); delete data[k]; save(s, data); },
    };
  }

  function init() {
    if (!ready) {
      ready = openIDB()
        .then(db => { impl = idbImpl(db); })
        .catch(err => { console.warn('IndexedDB unavailable, using localStorage:', err); impl = lsImpl(); })
        .then(() => {
          // Ask the browser not to evict our data. Fine if it says no.
          if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        });
    }
    return ready;
  }

  const call = name => async (...args) => { await init(); return impl[name](...args); };

  return {
    init,
    get backend() { return impl ? impl.backend : null; },
    get: call('get'),
    getAll: call('getAll'),
    put: call('put'),
    delete: call('delete'),
    async exportAll() {
      await init();
      const out = { app: NAME, schemaVersion: VERSION, exportedAt: new Date().toISOString(), backend: impl.backend, stores: {} };
      for (const s of Object.keys(STORES)) out.stores[s] = await impl.getAll(s);
      return out;
    },
  };
})();
