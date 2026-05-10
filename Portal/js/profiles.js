/**
 * Activation profile manager — IndexedDB persistence
 * Copyright © 2026 Sebastian Flæng Markdanner — MIT License
 *
 * Saves named groups of eligible role UIDs to IndexedDB so the user can
 * quickly reselect and activate their most-used role combinations.
 *
 * Store: pimactivation-profiles
 * Key:   profile.id (string, auto-generated UUID)
 */

const DB_NAME    = 'pimactivation-profiles';
const DB_VERSION = 1;
const STORE_NAME = 'profiles';

class ProfileManager {
  constructor() {
    this._db = null;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
        }
      };
      req.onsuccess = e => { this._db = e.target.result; resolve(); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  /**
   * Save a new profile.
   * @param {string}   name          — user-provided display name
   * @param {object[]} roles         — array of role descriptor objects to save
   * @param {object}   [opts]        — optional { justification, durationHours, durationMins }
   * @returns {Promise<object>} saved profile
   */
  async saveProfile(name, roles, opts = {}) {
    const profile = {
      id:            crypto.randomUUID(),
      name:          name.trim(),
      tenantId:      opts.tenantId || null,
      roles:         roles.map(r => ({ uid: r.uid, type: r.type, id: r.id, name: r.name, scope: r.scope })),
      justification: opts.justification || '',
      durationHours: opts.durationHours ?? 8,
      durationMins:  opts.durationMins  ?? 0,
      createdAt:     new Date().toISOString(),
      lastUsedAt:    null
    };
    await this._put(profile);
    return profile;
  }

  /**
   * Get saved profiles, optionally filtered to a tenant.
   * When tenantId is provided, returns profiles scoped to that tenant
   * plus profiles with no tenantId (saved while setting was off — global).
   * @param {string|null} [tenantId]
   * @returns {Promise<object[]>}
   */
  async getProfiles(tenantId) {
    const all = await this._getAll();
    if (!tenantId) return all;
    return all.filter(p => !p.tenantId || p.tenantId === tenantId);
  }

  /**
   * Update lastUsedAt timestamp for a profile.
   * @param {string} id
   */
  async touchProfile(id) {
    const profile = await this._get(id);
    if (profile) {
      profile.lastUsedAt = new Date().toISOString();
      await this._put(profile);
    }
  }

  /**
   * Delete a profile by ID.
   * @param {string} id
   */
  async deleteProfile(id) {
    return this._delete(id);
  }

  /**
   * Get all saved profiles (no filtering).
   * @returns {Promise<object[]>}
   */
  async getAllProfiles() {
    return this._getAll();
  }

  /**
   * Import multiple profiles.
   * @param {object[]} profiles
   */
  async importProfiles(profiles) {
    if (!Array.isArray(profiles)) throw new Error('Invalid profiles format');
    
    for (const p of profiles) {
      if (!p.name || !Array.isArray(p.roles)) continue;
      
      const imported = {
        ...p,
        id:            crypto.randomUUID(), // Always give new ID to avoid collisions
        createdAt:     p.createdAt || new Date().toISOString(),
        lastUsedAt:    null // Reset usage on import
      };
      await this._put(imported);
    }
  }

  // ── Private IndexedDB helpers ──────────────────────────────────────────────

  _tx(mode) {
    return this._db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  }

  _put(record) {
    return new Promise((resolve, reject) => {
      const req = this._tx('readwrite').put(record);
      req.onsuccess = () => resolve(record);
      req.onerror   = e  => reject(e.target.error);
    });
  }

  _get(id) {
    return new Promise((resolve, reject) => {
      const req = this._tx('readonly').get(id);
      req.onsuccess = e => resolve(e.target.result || null);
      req.onerror   = e => reject(e.target.error);
    });
  }

  _getAll() {
    return new Promise((resolve, reject) => {
      const req = this._tx('readonly').getAll();
      req.onsuccess = e => resolve(e.target.result || []);
      req.onerror   = e => reject(e.target.error);
    });
  }

  _delete(id) {
    return new Promise((resolve, reject) => {
      const req = this._tx('readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = e  => reject(e.target.error);
    });
  }
}

window.profileManager = new ProfileManager();
