/* ==========================================================================
   LK OS — visionstore.js  (v2.3)
   Tiny IndexedDB wrapper for Vision Board photos ONLY. This is the one
   deliberate exception to "data.js is the only thing touching browser
   storage" — IndexedDB is a completely separate API from localStorage, so
   storing image blobs here keeps large binary data out of LK.db/localStorage
   entirely (per spec) while still persisting across sessions, unlike the
   ephemeral object URLs used for local audio in music.js. LK.db.visionGoals
   only ever stores a small string id referencing an image here.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  const DB_NAME = 'lk_os_vision_store', STORE = 'images';
  let dbPromise = null;

  function isSupported() { return !!window.indexedDB; }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!isSupported()) { reject(new Error('IndexedDB not supported in this browser')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function putImage(id, blob) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getImageURL(id) {
    if (!id) return null;
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result ? URL.createObjectURL(req.result) : null);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteImage(id) {
    if (!id) return;
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  LK.visionStore = { putImage, getImageURL, deleteImage, isSupported };
})();
