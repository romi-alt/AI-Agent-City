// This browser's device key (DESIGN.md "Device binding"). Browser-only: it uses IndexedDB and WebCrypto.
//
// The key pair is generated once with `extractable: false` and the CryptoKeyPair object itself is stored in
// IndexedDB (structured clone keeps it non-extractable), so page scripts can sign with it but never read the private
// key. The device id is the public key's RFC 7638 thumbprint.
import { jwkThumbprint, proofUrl, signDeviceProof, toPublicJwk, type PublicEcJwk } from './device-proof';

const DB_NAME = 'agentcity-device';
const STORE = 'keys';
const KEY_ID = 'device';

export interface DeviceKey {
  privateKey: CryptoKey;
  publicJwk: PublicEcJwk;
  /** RFC 7638 thumbprint of the public key: the id the API gives this device. */
  thumbprint: string;
}

let cached: Promise<DeviceKey> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readPair(db: IDBDatabase): Promise<CryptoKeyPair | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY_ID);
    req.onsuccess = () => resolve(req.result as CryptoKeyPair | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Store the pair only if no other tab got there first (`add` fails on an existing key). */
function addPair(db: IDBDatabase, pair: CryptoKeyPair): Promise<boolean> {
  return new Promise(resolve => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add(pair, KEY_ID);
    req.onerror = event => {
      event.preventDefault();
      resolve(false);
    };
    tx.oncomplete = () => resolve(true);
    tx.onabort = () => resolve(false);
  });
}

async function loadOrCreate(): Promise<DeviceKey> {
  const db = await openDb();
  try {
    let pair = await readPair(db);
    if (!pair) {
      const fresh = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
      pair = (await addPair(db, fresh)) ? fresh : await readPair(db);
      if (!pair) throw new Error('could not store the device key');
    }
    // Public keys stay exportable even when the pair is generated with extractable: false.
    const publicJwk = toPublicJwk(await crypto.subtle.exportKey('jwk', pair.publicKey));
    return { privateKey: pair.privateKey, publicJwk, thumbprint: await jwkThumbprint(publicJwk) };
  } finally {
    db.close();
  }
}

/** This browser's device key, created on first use. */
export function getDeviceKey(): Promise<DeviceKey> {
  if (!cached) {
    cached = loadOrCreate();
    cached.catch(() => (cached = null));
  }
  return cached;
}

/** A fresh proof for one request from this page: `target` is a path such as "/api/auth/me?x=1" (query is dropped). */
export async function deviceProof(method: string, target: string): Promise<string> {
  const key = await getDeviceKey();
  return signDeviceProof({
    privateKey: key.privateKey,
    publicJwk: key.publicJwk,
    htm: method,
    htu: proofUrl(window.location.origin, target),
  });
}
