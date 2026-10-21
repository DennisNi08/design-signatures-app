/*
 * Copyright (c) 2021, Design Awareness Contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import defer from "../util/defer";
import { VERSION } from "./buildData";
import * as Schema from "./schema";
import { initializeConfiguration, upgradeDatabase } from "./upgradeDatabase";
import {
  doc, setDoc, deleteDoc, getDoc, collection, getDocs, where, query} from "firebase/firestore";
import { db } from "./firebase";
import {Timestamp} from "firebase/firestore";

const DB_NAME = "design-awareness-local-store";
const META_KEY = "@meta";

type DBID = string;

/**
 * whether the database is open
 */
let dbOpen = false;

/**
 * promise resolving to the open database
 */
let dbPromise: Promise<IDBDatabase>;

/**
 * whether the database open has been started
 */
let dbOpenAttempted = false;

/**
 * @returns whether the database is open
 */
export function isOpen() {
  return dbOpen;
}

const [_onUpgradeNeeded, requestUpgrade] = defer<number>();
export const onUpgradeNeeded = _onUpgradeNeeded;

type ObjectStoreName = Schema.EntityName | "_Config" | string;

/**
 * Get the IDB Database, opening it if it isn't open yet.
 * @param onblocked function to run if the database open blocks.
 *                  (only works on the first call)
 * @returns promise resolving to the open idb database
 */
function getDb(onblocked?: (evt: any) => void) {
  if (!dbOpenAttempted) {
    dbOpenAttempted = true;
    dbPromise = new Promise((res, rej) => {
      const request = window.indexedDB.open(DB_NAME, Schema.DB_VERSION);
      if (onblocked) {
        request.onblocked = onblocked;
      }
      request.onerror = rej;
      request.onupgradeneeded = (event) => {
        const db = (event.target as any as { result: IDBDatabase }).result;
        if (event.oldVersion === 0) {
          console.log("First visit: setting up database!");
          db.createObjectStore("AsyncEntry", { keyPath: "id" });
          db.createObjectStore("AsyncProject", { keyPath: "id" });
          db.createObjectStore("DesignModel", { keyPath: "id" });
          db.createObjectStore("ProjectNote", { keyPath: "id" });
          db.createObjectStore("RealtimeProject", { keyPath: "id" });
          db.createObjectStore("RealtimeSession", { keyPath: "id" });
          db.createObjectStore("TimedNote", { keyPath: "id" });
          db.createObjectStore("_Config", { keyPath: "key" });
        } else {
          console.log("Database needs upgrading: ");
          upgradeDatabase(event.oldVersion, db);
          dbPromise?.then(() => {
            requestUpgrade(event.oldVersion);
          });
        }
        dbPromise?.then(() => {
          console.log("initializing config!");
          initializeConfiguration(event.oldVersion, rawDatabaseOperations);
        });
      };
      request.onsuccess = (event) => {
        dbOpen = true;
        // @ts-ignore
        const db = event.target.result;
        db.onversionchange = (/*event*/) => {
          db.close();
          alert(
            "A new version of this page is ready. Please reload or close this tab!"
          );
        };
        res(db);
      };
    });
  }
  return dbPromise;
}

/**
 * Create a new transaction in the database. Opens the database if it
 * is not open already.
 * @param store name of the database store
 * @param accessLevel IDB transaction access level
 * @returns a tuple with a promise which will resolve when the
 *          transaction is complete, and the database object store on which
 *          operations can be performed.
 */
function transaction(
  db: IDBDatabase,
  store: ObjectStoreName,
  accessLevel = "readonly" as IDBTransactionMode
): {
  complete: Promise<Event>;
  objectStore: IDBObjectStore;
} {
  const transaction = db.transaction(store, accessLevel);
  return {
    complete: new Promise((res, rej) => {
      transaction.oncomplete = res;
      transaction.onerror = rej;
    }),
    objectStore: transaction.objectStore(store),
  };
}

/**
 * Adds given new entry (data) to the given datastore. Resolves when the
 * transaction is complete. Use update to update an existing entry.
 */
async function add(store: ObjectStoreName, data: any) {
  if (store === "_Config") {
    const idb = await getDb();
    const { complete, objectStore } = transaction(idb, store, "readwrite");
    objectStore.add(data);
    await complete;
    return;
  }
   await setDoc(doc(db, store, data.id), data);
}

/**
 * Updates given entry in the given datastore. Resolves when the transaction
 * is complete. Use to update an entry that is already saved.
 */
async function update(store: ObjectStoreName, data: any) {
  if (store === "_Config") {
    const idb = await getDb();
    const { complete, objectStore } = transaction(idb, store, "readwrite");
    objectStore.put(data);
    await complete;
    return;
  }
  await setDoc(doc(db, store, data.id), data);
}

/**
 * Remove entry with given id from the given datastore.
 */
async function remove(store: ObjectStoreName, id: DBID) {
  if (store === "_Config") {
    const idb = await getDb();
    const { complete, objectStore } = transaction(idb, store, "readwrite");
    objectStore.delete(id);
    await complete;
    return;
  }
  await deleteDoc(doc(db, store, id));
}



/**
 * Resolves to the stored data for the given id from the given datastore.
 */
function convertTimestamps(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (obj instanceof Timestamp) {
    return obj.toDate();
  }
  if (Array.isArray(obj)) {
    return obj.map(convertTimestamps);
  }
  const result: Record<string,any> = {};
  for (const key in obj) {
    result[key] = convertTimestamps(obj[key]);
  }
  return result;
}


async function get(store: ObjectStoreName, id: DBID): Promise<object | null> {
  if (store === "_Config") {
    const idb = await getDb();
    const { objectStore } = transaction(idb, store);
    const request = objectStore.get(id);
    return (
      (await new Promise((res, rej) => {
        request.onerror = rej;
        request.onsuccess = res;
      })) as any
    )["target"]["result"];
  }
  try {
    const snap = await getDoc(doc(db, store, id));
    return snap.exists() ? convertTimestamps(snap.data()) : null;
  } catch (err) {
    console.error(`get(${store}, ${id}) — THREW:`, err);
    throw err;
  }
}

export const rawDatabaseOperations = {
  add,
  update,
  remove,
  get,
};

/**
 * keys are entry ids waiting to be loaded, mapping to promises that will
 * resolve when the database returns the object.
 *
 * to support resolving cyclic references without deadlocking,
 * note that references to other entries may not be resolved yet when the
 * promise completes. instead, use getEntry to obtain a fully resolved model.
 *
 * always check this map before attempting to load an entry directly from
 * the database, to prevent duplicate objects for one entry.
 * getEntry and the model-specific get methods perform this check.
 */
const resolving = {
  AsyncEntry: new Map<DBID, Promise<void>>(),
  AsyncProject: new Map<DBID, Promise<void>>(),
  DesignModel: new Map<DBID, Promise<void>>(),
  ProjectNote: new Map<DBID, Promise<void>>(),
  RealtimeProject: new Map<DBID, Promise<void>>(),
  RealtimeSession: new Map<DBID, Promise<void>>(),
  TimedNote: new Map<DBID, Promise<void>>(),
};

/**
 * internal object lookup containing already resolved objects.
 * always lookup here before loading something from the database
 * yourself, or you might end up with multiple objects for the same entry.
 */
const objStore = {
  // i like the typing here but the sad truth is that we're always
  // gonna pull from here in getEntry which will type them as IDBClientObjects
  // and then the specific model getter methods cast back to the right type
  // ...oh well.
  AsyncEntry: new Map<DBID, Schema.AsyncEntry>(),
  AsyncProject: new Map<DBID, Schema.AsyncProject>(),
  DesignModel: new Map<DBID, Schema.DesignModel>(),
  ProjectNote: new Map<DBID, Schema.ProjectNote>(),
  RealtimeProject: new Map<DBID, Schema.RealtimeProject>(),
  RealtimeSession: new Map<DBID, Schema.RealtimeSession>(),
  TimedNote: new Map<DBID, Schema.TimedNote>(),
};

/**
 * Resolves to the IDs of all entries in the given datastore.
 */
export function getAll(store: Schema.EntityName): Promise<DBID[]> {
  return getDocs(collection(db, store)).then((snap) => snap.docs.map((d) => d.id));
}

/**
 * Resolves to the entry with the given id in the given datastore.
 * If there is no entry for the given id, resolves to null.
 *
 * This operation is fast if the entry has already been loaded.
 * If called multiple times with the same id, it will always
 * resolve to the same client object. This is to ensure there is
 * one source-of-truth object for each database entry, so you
 * shouldn't attempt to copy or mutate the object other than
 * the public interface provided.
 *
 * Entries are wrapped with appropriate database manipulation methods
 * and all children will be fully resolved, so they are ready to use,
 * though for safety, you should cast to the appropriate model interface,
 * or use the helper methods (getDesignModel, etc.) that do this for you.
 * (Type checking is no longer enforced at runtime, so using the interfaces
 * will help you ensure type correctness when setting properties.)
 */

//8/25/26 Fixed function to make sure that even if a get function fails in child objects, the projects will still load
//Fixes bug where show all projects screen would not load if a child object was missing or deleted, leading to infinite buffer
async function getEntry(
  store: Schema.EntityName,
  id: DBID
): Promise<Schema.Entity | null> {
  if (id === null) return null;

  const typeStore = objStore[store] as Map<DBID, Schema.Entity>;
  const resolveStore = resolving[store];
  if (!typeStore.has(id)) {
    if (resolveStore.has(id)) {
      await resolveStore.get(id);
    } else {
      // needs to be resolved!
      const [promise, resolver] = defer<void>();
      resolveStore.set(id, promise);

      // lookup entry from db;
      try{
      const obj = (await get(store, id)) as Schema.Entity;
      if (!obj) {
        return null;
      }

      const [clientObj, childResolutionPromise] = createClientObject(
        store,
        obj,
        id
      );

      // no cyclic objects, or we'll never resolve!
      await childResolutionPromise;
      // resolve complete
      typeStore.set(id, clientObj);
    }finally {
      resolveStore.delete(id);
      resolver();
    }
  }
}
  return typeStore.get(id) ?? null;
}

/**
 * database entry wrapper for happier clients!
 *
 * allows listening for updates to fields, checking dirty status,
 * and saving back to the database.
 *
 * if you cast this thing right, typescript will hopefully
 * keep you from doing bad things
 *
 * @param store type of model
 * @param rawObj raw object retrieved from database
 * @param id object id
 */
function createClientObject(
  store: Schema.EntityName,
  rawObj: Record<string, any>,
  _id: DBID | null = null
): [Schema.Entity, Promise<any[]>] {
  const schema = Schema.Schema[store];
  const data: Record<string, any> = {};
  const obj = {};
  let meta: Record<string, any> = {};
  const childResolvers = [];
  // ids of repeated children that exist but couldn't be read (e.g. a
  // permission or network error); kept so save() doesn't drop them
  const unreadableChildIds: Record<string, string[]> = {};

  // client obj private properties
  let dirty = !_id;
  let saving = false;
  let id = _id;
  let deleted = false;

  for (let [name, dbtype, repeated] of schema) {
    if (dbtype == null) {
      data[name] = rawObj[name];
    } else {
      let modelName = dbtype;
      // children need resolving!!
      if (!repeated) {
        const childID = rawObj[name];
        if (childID) {
          childResolvers.push(
            (async () => {
              data[name] = await getEntry(modelName, childID);
            })()
          );
        } else {
          data[name] = null;
        }
      } else {
        const childIDs: string[] = Array.isArray(rawObj[name]) ? rawObj[name] : [];
        if (childIDs.length) {
          childResolvers.push(
            (async () => {
              const failed = new Set<string>();
              const children = await Promise.all(
                childIDs.map((childID) =>
                  getEntry(modelName, childID).catch((err) => {
                    console.warn(`Couldn't load ${modelName} ${childID}`, err);
                    failed.add(childID);
                    return null;
                  })
                )
              );
              // Deleted children (null) are dropped so the next save cleans
              // them up; unreadable ones are hidden but preserved on save.
              data[name] = children.filter((child) => child !== null);
              unreadableChildIds[name] = childIDs.filter((childID) => failed.has(childID));
            })()
          );
        } else {
          data[name] = [];
        }
      }
    }
    Object.defineProperty(obj, name, {
      get() {
        return data[name];
      },
      set(v) {
        if (deleted) {
          throw new Error("Attempted to modify a deleted entry!");
        }
        if (v !== data[name]) {
          data[name] = v;
          dirty = true;
        }
      },
    });
  }
  if (typeof rawObj[META_KEY] === "object") {
    meta = rawObj[META_KEY];
  }

  // add wrapper properties & methods
  Object.defineProperty(obj, "dirty", { get: () => dirty });
  Object.defineProperty(obj, "saving", { get: () => saving });
  Object.defineProperty(obj, "id", { get: () => id });
  Object.defineProperty(obj, "deleted", { get: () => deleted });

  let removing: Promise<void> | null = null;
  Object.assign(obj, {
    // save is typed as async () => void to prevent
    // setting ids unless you really, really
    // mean to!
    async save(newSaveId: string) {
      if (dirty && !saving) {
        saving = true;
        const isNewEntry = id === null;
        if (id === null) {
          id = newSaveId || idgen();
          objStore[store].set(id, obj as any);
        }

        const dbObj: Record<string, any> = { id };
        const savingChildren = [];
        // pack into db-friendly object
        for (let [name, dbtype, repeated] of schema) {
          if (dbtype === null) {
            dbObj[name] = data[name];
          } else {
            // child db entry - save this too!
            // no issues with cycles - save is instant if already saving
            if (repeated) {
              if (!data[name]) data[name] = [];
              const children = (data[name] as any[]).filter((child) => child !== null);
              savingChildren.push(Promise.all(children.map((child) => child.save())));
              const childIds: string[] = children.map((child) => child.id);
              for (const unreadableId of unreadableChildIds[name] ?? []) {
                if (!childIds.includes(unreadableId)) childIds.push(unreadableId);
              }
              dbObj[name] = childIds;
            } else {
              if (data[name] === null) {
                dbObj[name] = null;
              } else {
                const childPromise = data[name].save();
                dbObj[name] = data[name].id;
                savingChildren.push(childPromise);
              }
            }
          }
        }
        dbObj[META_KEY] = meta;

        dirty = false;

        try {
          if (isNewEntry) {
            await add(store, dbObj);
          } else {
            await update(store, dbObj);
          }
          // in case any children haven't finished saving...
          await Promise.all(savingChildren);
        } catch (err) {
          // leave the object saveable so the user's edit isn't silently lost
          dirty = true;
          throw err;
        } finally {
          saving = false;
        }
      }
    },
    remove() {
      if (id !== null) {
        objStore[store].delete(id);
        deleted = true;
        removing = remove(store, id);
        id = null;
      }
      if (removing) {
        return removing;
      }
    },

    toSerializable() {
      const rawObj: Record<string, any> = {};
      rawObj.id = id;
      for (let [name, isEntityType, repeated] of schema) {
        if (isEntityType) {
          if (repeated) {
            rawObj[name] = data[name].map((member: Schema.Entity) =>
              member.toSerializable()
            );
          } else {
            rawObj[name] = data[name].toSerializable();
          }
        } else {
          rawObj[name] = data[name];
        }
      }
      return rawObj;
    },

    serialize(pretty = false): string {
      const entryData = this.toSerializable();
      return JSON.stringify(
        {
          $format: "design-awareness",
          version: "1.0.0",
          type: store,
          data: entryData,
          meta: {
            encoder: "design-signatures-app@" + VERSION,
          },
        },
        null,
        pretty ? 2 : undefined
      );
    },

    getMeta(key: string, defaultValue: any) {
      return meta[key] ?? defaultValue;
    },
    setMeta(key: string, value: any) {
      if (meta[key] !== value) {
        meta[key] = value;
        dirty = true;
      }
    },
  });

  return [obj as Schema.Entity, Promise.all(childResolvers)];
}

export function getAsyncEntry(id: DBID) {
  return getEntry("AsyncEntry", id) as Promise<Schema.AsyncEntry>;
}
export function getAsyncProject(id: DBID) {
  return getEntry("AsyncProject", id) as Promise<Schema.AsyncProject>;
}
export function getDesignModel(id: DBID) {
  return getEntry("DesignModel", id) as Promise<Schema.DesignModel>;
}
export function getProjectNote(id: DBID) {
  return getEntry("ProjectNote", id) as Promise<Schema.ProjectNote>;
}
export function getRealtimeProject(id: DBID) {
  return getEntry("RealtimeProject", id) as Promise<Schema.RealtimeProject>;
}
export function getRealtimeSession(id: DBID) {
  return getEntry("RealtimeSession", id) as Promise<Schema.RealtimeSession>;
}
export function getTimedNote(id: DBID) {
  return getEntry("TimedNote", id) as Promise<Schema.TimedNote>;
}

export async function getAllDesignModelIds(uid: string): Promise<DBID[]> {
  const [wellKnownSnap, ownedSnap] = await Promise.all([
    getDocs(query(collection(db, "DesignModel"), where("wellKnown", "==", true))),
    getDocs(query(collection(db, "DesignModel"), where("ownerUid", "==", uid))),
  ]);
  const ids = new Set<string>();
  wellKnownSnap.docs.forEach((d) => ids.add(d.id));
  ownedSnap.docs.forEach((d) => ids.add(d.id));
  return Array.from(ids);
}

export async function getUserProjectsIds(uid: string): Promise<string[]> {
  const memberSnap = await getDocs(
    query(collection(db, "projectMembers"), where("uid", "==", uid), where("status", '==', 'active'))
  );
  return memberSnap.docs.map((d) => d.data().projectId as string);
}
export async function getProjectOrFail(
  id: DBID
): Promise<
  | ["AsyncProject", Schema.AsyncProject]
  | ["RealtimeProject", Schema.RealtimeProject]
> {
  const [asyncResult, realtimeResult] = await Promise.allSettled([
    getEntry("AsyncProject", id),
    getEntry("RealtimeProject", id),
  ]);

  const asyncProject = asyncResult.status === "fulfilled" ? asyncResult.value : null;
  const realtimeProject = realtimeResult.status === "fulfilled" ? realtimeResult.value : null;

  if (asyncProject) return ["AsyncProject", asyncProject as Schema.AsyncProject];
  if (realtimeProject) return ["RealtimeProject", realtimeProject as Schema.RealtimeProject];
  throw new Error("No project found.");
}

/**
 * Evicts a single cached entry so the next getEntry() call for it re-fetches
 * from Firestore instead of returning the (possibly stale) in-memory copy.
 */
function invalidateEntry(store: Schema.EntityName, id: DBID): void {
  objStore[store].delete(id);
  resolving[store].delete(id);
}

/**
 * Busts the in-memory cache (see `objStore`) for a project and everything
 * reachable from it in the cache (entries, notes, sessions, their timed
 * notes, and the design model), so the next load re-reads it from Firestore.
 *
 * getEntry() caches every entity forever once loaded and nothing listens for
 * remote changes, so without this a member who already viewed a project in
 * this tab keeps seeing it as it was at that first visit. Call this right
 * before (re)loading a project for viewing so each visit reflects edits
 * other members have saved since.
 *
 * Walks only what's already cached, so it costs no network round-trips:
 * anything not cached will be fetched fresh anyway. Does nothing if any
 * object in the project has unsaved or in-flight changes, since refetching
 * would discard them.
 */
export function invalidateProjectCache(id: DBID): void {
  const project = (objStore.AsyncProject.get(id) ?? objStore.RealtimeProject.get(id)) as
    | Record<string, any>
    | undefined;
  if (!project) return;

  const toEvict: [Schema.EntityName, Record<string, any>][] = [];
  const isAsync = objStore.AsyncProject.has(id);
  toEvict.push([isAsync ? "AsyncProject" : "RealtimeProject", project]);
  if (project.designModel) toEvict.push(["DesignModel", project.designModel]);
  for (const note of project.notes ?? []) toEvict.push(["ProjectNote", note]);
  for (const entry of project.entries ?? []) toEvict.push(["AsyncEntry", entry]);
  for (const session of project.sessions ?? []) {
    toEvict.push(["RealtimeSession", session]);
    for (const note of session.notes ?? []) toEvict.push(["TimedNote", note]);
  }

  if (toEvict.some(([, entity]) => entity.dirty || entity.saving)) return;
  for (const [store, entity] of toEvict) {
    if (entity.id) invalidateEntry(store, entity.id);
  }
}

/**
 * Lightweight lookup of just the top-level project documents (no entries,
 * notes or sessions), for sorting/filtering project lists without paying
 * to load every project's full tree.
 */
async function getProjectSummaries(
  ids: DBID[]
): Promise<{ id: DBID; modified: Date }[]> {
  const results = await Promise.all(
    ids.map(async (id) => {
      const [asyncRaw, realtimeRaw] = await Promise.allSettled([
        get("AsyncProject", id),
        get("RealtimeProject", id),
      ]);
      const raw = ((asyncRaw.status === "fulfilled" && asyncRaw.value) ||
        (realtimeRaw.status === "fulfilled" && realtimeRaw.value) ||
        null) as Record<string, any> | null;
      if (!raw) return null;
      const modified = raw.modified instanceof Date ? raw.modified : new Date(0);
      return { id, modified };
    })
  );
  return results.filter((r) => r !== null);
}

/** The user's project ids, most recently modified first. */
export async function getUserProjectIdsByRecency(uid: string): Promise<DBID[]> {
  const ids = await getUserProjectsIds(uid);
  const summaries = await getProjectSummaries(ids);
  summaries.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  return summaries.map(({ id }) => id);
}

function newEntity(type: Schema.EntityName) {
  const schema = Schema.Schema[type];
  const defaults = Object.fromEntries(
    schema.map(([prop, entityType, def]) => [
      prop,
      entityType === null
        ? typeof def === "function"
          ? def()
          : def
        : def
        ? []
        : null,
    ])
  );
  return createClientObject(type, defaults);
}

export function newAsyncEntry() {
  return newEntity("AsyncEntry")[0] as Schema.AsyncEntry;
}
export function newAsyncProject() {
  return newEntity("AsyncProject")[0] as Schema.AsyncProject;
}
export function newDesignModel() {
  return newEntity("DesignModel")[0] as Schema.DesignModel;
}
export function newProjectNote() {
  return newEntity("ProjectNote")[0] as Schema.ProjectNote;
}
export function newRealtimeProject() {
  return newEntity("RealtimeProject")[0] as Schema.RealtimeProject;
}
export function newRealtimeSession() {
  return newEntity("RealtimeSession")[0] as Schema.RealtimeSession;
}
export function newTimedNote() {
  return newEntity("TimedNote")[0] as Schema.TimedNote;
}

export function deleteDB(): Promise<Event> {
  return new Promise((res, rej) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = res;
    req.onerror = rej;
  });
}

//removes entries from projectMember database once a project has been deleted
export async function removeProjectMemberships(projectId:string): Promise<void>{
  const snap = await getDocs(
    query(collection(db,"projectMembers"), where("projectId", "==", projectId))
  );
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

export async function getAllWellKnownDesignModelIds(): Promise<DBID[]> {
  const snap = await getDocs(
    query(collection(db, "DesignModel"), where("wellKnown", "==", true))
  );
  return snap.docs.map((d) => d.id);
}

export async function getRecentUserProjects(uid:string, limitCount = 8) {
  const ids = await getUserProjectIdsByRecency(uid);
  return ids.slice(0, limitCount);
}

/**
 * Returns a unique* 24 character alphanumeric id.
 * The first 16 characters are random, and the last 8
 * are derived from the current millisecond.
 *
 * *The chance of collision is somewhere around 1:10^24 for ids
 * generated in the same millisecond. That *should* be fine...
 */
function idgen() {
  return (
    Date.now().toString(36).substring(-8) +
    Math.random().toString(36).substring(2, 10) +
    Math.random().toString(36).substring(2, 10)
  );
}
