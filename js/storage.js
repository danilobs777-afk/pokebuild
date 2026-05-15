'use strict';

/**
 * storage.js — Persistência de times via IndexedDB
 * -------------------------------------------------
 * Usa IndexedDB (não localStorage) porque times salvos podem acumular
 * volume considerável (sprites cacheados pela PokeAPI + dados de EVs/moves).
 * O localStorage tem limite de ~5MB e lança exceção silenciosa ao estourar.
 *
 * Padrão: IIFE que expõe apenas a API pública { saveTeam, updateTeam, getTeam, getTeams, deleteTeam }.
 * Dependências: nenhuma (puro Web API).
 */

const TeamStorage = (() => {
  const DB_NAME    = 'pokebuild_db';
  const DB_VERSION = 1;
  const STORE      = 'teams';
  let db = null; // singleton da conexão — reutilizado entre chamadas

  /**
   * Abre (ou reutiliza) a conexão com o IndexedDB.
   * Cria o object store na primeira execução (onupgradeneeded).
   * @returns {Promise<IDBDatabase>}
   */
  function open() {
    return new Promise((resolve, reject) => {
      if (db) { resolve(db); return; } // evita abrir múltiplas conexões
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const idb = e.target.result;
        if (!idb.objectStoreNames.contains(STORE)) {
          const store = idb.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('name',    'name',    { unique: false });
          store.createIndex('format',  'format',  { unique: false });
          store.createIndex('created', 'created', { unique: false });
        }
      };
      req.onsuccess = e => { db = e.target.result; resolve(db); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** Atalho para abrir uma transação no object store de times. */
  function tx(mode = 'readonly') {
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  /** Converte um IDBRequest (callback) em Promise — evita callback hell. */
  function wrap(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function saveTeam(team) {
    await open();
    const record = { ...team, created: Date.now(), updated: Date.now() };
    return wrap(tx('readwrite').add(record));
  }

  async function updateTeam(id, team) {
    await open();
    const existing = await getTeam(id);
    const record = { ...existing, ...team, id, updated: Date.now() };
    return wrap(tx('readwrite').put(record));
  }

  async function getTeam(id) {
    await open();
    return wrap(tx().get(id));
  }

  async function getTeams() {
    await open();
    return wrap(tx().getAll());
  }

  async function deleteTeam(id) {
    await open();
    return wrap(tx('readwrite').delete(id));
  }

  return { saveTeam, updateTeam, getTeam, getTeams, deleteTeam };
})();
