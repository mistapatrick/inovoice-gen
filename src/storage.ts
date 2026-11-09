import type { Client, Profile, SavedDocument } from "./types";
import { emptyProfile } from "./types";

const DB_NAME = "invoice-gen-local";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("profiles")) db.createObjectStore("profiles", { keyPath: "id" });
      if (!db.objectStoreNames.contains("clients")) db.createObjectStore("clients", { keyPath: "id" });
      if (!db.objectStoreNames.contains("documents")) db.createObjectStore("documents", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function request<T>(store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = action(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

export const db = {
  async getProfile(): Promise<Profile> {
    const row = await request<any>("profiles", "readonly", s => s.get("default"));
    return row?.value ?? emptyProfile;
  },
  saveProfile(profile: Profile) {
    return request("profiles", "readwrite", s => s.put({ id: "default", value: profile }));
  },
  getClients(): Promise<Client[]> {
    return request<any[]>("clients", "readonly", s => s.getAll());
  },
  saveClient(client: Client) {
    return request("clients", "readwrite", s => s.put(client));
  },
  deleteClient(id: string) {
    return request("clients", "readwrite", s => s.delete(id));
  },
  getDocuments(): Promise<SavedDocument[]> {
    return request<SavedDocument[]>("documents", "readonly", s => s.getAll());
  },
  saveDocument(doc: SavedDocument) {
    return request("documents", "readwrite", s => s.put(doc));
  },
  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const row = await request<any>("settings", "readonly", s => s.get(key));
    return row?.value ?? fallback;
  },
  saveSetting(key: string, value: unknown) {
    return request("settings", "readwrite", s => s.put({ key, value }));
  },
  async clearAll() {
    const database = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(["profiles", "clients", "documents", "settings"], "readwrite");
      ["profiles", "clients", "documents", "settings"].forEach(name => tx.objectStore(name).clear());
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  }
};
