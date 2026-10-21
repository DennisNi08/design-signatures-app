/*
 * Copyright (c) 2021, Design Awareness Contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type { AllRequired } from "../types/utility";
import { hasOwnProperty } from "../types/utility";
import { deepClone, deepEquals } from "../util/deepObject";
import {
  checkOptionalProperty,
  checkProperty,
  typeIsArrayOf,
  typeIsBoolean,
  typeIsColorTuple,
  typeIsDate,
  typeIsEnum,
  typeIsNonemptyString,
  typeIsNull,
  typeIsNumber,
  typeIsNumberPair,
  typeIsRecord,
  typeIsString,
  typeSatisfiesAll,
  typeSatisfiesAny,
} from "../util/runtimeTypecheck";
import {
  getAsyncEntry,
  getAsyncProject,
  getDesignModel,
  getProjectNote,
  getProjectOrFail,
  getRealtimeProject,
  getRealtimeSession,
  getTimedNote,
  newAsyncEntry,
  newAsyncProject,
  newDesignModel,
  newProjectNote,
  newRealtimeProject,
  newRealtimeSession,
  newTimedNote,
} from "./database";
import type {
  AsyncEntry,
  AsyncProject,
  DesignModel,
  Entity,
  EntityName,
  ProjectNote,
  RealtimeProject,
  RealtimeSession,
  TimedNote,
} from "./schema";
import { getUid } from "./authState.svelte"
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export interface ImportResult<E extends Entity> {
  type: EntityName;
  id: string;
  name: string;

  /**
   * Whether an entity of this type and ID already exists
   */
  exists: boolean;

  /**
   * If exists, whether this entity is older than the existing one
   */
  isOlder: boolean;

  /**
   * Whether a conflict exists that will prevent this entity from being
   * imported over an existing one
   */
  hasConflict: boolean;

  /**
   * If exists, which properties will be changed if this entity is
   * imported over an existing one.
   * If any properties are present, *overwrite* is required to update this entity.
   */
  differingProperties: (keyof E)[];

  /**
   * ImportResults for all child entities.
   */
  children: Partial<Record<EntityName, ImportResult<any>[]>>;

  /**
   * If not a dry-run, the newly created/updated entity
   */
  entity: E | undefined;
}

export interface EntityImportOptions {
  /**
   * If true, allow importing an entity when one already exists.
   */
  overwrite?: boolean;

  /**
   * If true, new entities will be created and given ids are ignored.
   */
  forceNew?: boolean;

  /**
   * If true, ignore data in the given entity and use the one
   * that already exists instead.
   */
  useExisting?: boolean;
}
const ENTITY_IMPORT_DEFAULTS: EntityImportOptions = {
  overwrite: false,
  forceNew: false,
  useExisting: false,
};

export interface ImportOptions {
  /**
   * Set true to "test out" an import without actually creating any new
   * entities or overwriting anything.
   */
  dryRun: boolean;

  /**
   * Options to apply to every entity
   */
  globalOptions: EntityImportOptions;

  /**
   * Options to apply to all entities of a specific type.
   * Overrides settings in globalOptions.
   */
  typeOptions: Partial<Record<EntityName, EntityImportOptions>>;

  /**
   * Options to apply to entities with specific IDs.
   * Overrides settings in globalOptions and typeOptions.
   */
  entityOptions: Record<string, EntityImportOptions>;
}

function getOptions(
  options: ImportOptions,
  type: EntityName,
  id: string
): AllRequired<EntityImportOptions> {
  return Object.assign(
    {},
    ENTITY_IMPORT_DEFAULTS,
    options.globalOptions,
    options.typeOptions[type],
    options.entityOptions[id]
  );
}

function saveEntityWithId(entity: Entity, id: string): Promise<void> {
  return (entity.save as (id: string) => Promise<void>)(id);
}

function datifyProperties<T extends { id: string }>(
  object: T,
  props: (keyof T)[],
  trace: string
): void {
  for (let prop of props) {
    if (hasOwnProperty(object, prop)) {
      let val = object[prop];
      if (typeof val !== "string") {
        datifyBail(object, prop, trace);
      }
      try {
        let date = new Date(val);
        if (Number.isNaN(date.getDate())) {
          datifyBail(object, prop, trace);
        }
        object[prop] = date as any;
      } catch (e) {
        datifyBail(object, prop, trace);
      }
    }
  }
}
function datifyBail<T extends { id: string }>(
  object: T,
  prop: keyof T,
  trace: string
): never {
  let id = object.id ?? "[No ID]";
  throw new Error(
    `[${trace}|date]: ${String(prop)} couldn't be resolved to a Date ${object[prop]}`
  );
}

function hasId<T extends {}>(
  data: T
): data is T & Record<"id", Exclude<string, "">> {
  return hasOwnProperty(data, "id") && typeof data.id === "string" && !!data.id;
}

type TypeAssertFunction<O extends Record<string, any>> = <
  P extends string,
  T,
  R extends boolean
>(
  testObject: O,
  property: P,
  typeTest: (value: any) => value is T,
  required: R
) => testObject is O &
  (R extends true ? Record<P, T> : Record<P, T | undefined>);

function typeAssertWrapper<O extends Record<string, any>>(
  trace: string
): TypeAssertFunction<O> {
  return <P extends string, T, R extends boolean>(
    testObject: O,
    property: P,
    typeTest: (value: any) => value is T,
    required: R
  ): testObject is O &
    (R extends true ? Record<P, T> : Record<P, T | undefined>) => {
    if (required) {
      if (!checkProperty(property, typeTest)(testObject))
        throw new Error(
          `[${trace}|typecheck] wrong type or missing property "${property}"`
        );
    } else {
      if (!checkOptionalProperty(property, typeTest)(testObject))
        throw new Error(
          `[${trace}|typecheck] wrong type for property "${property}"`
        );
    }
    return true;
  };
}

function findDifferingProperties<E extends Entity>(
  input: Record<string, any>,
  known: E,
  standardProps: (keyof E & string)[],
  entityProps: (keyof E & string)[],
  entityListProps: (keyof E & string)[]
): (keyof E)[] {
  let differingProps: (keyof E)[] = [];
  for (let prop of standardProps) {
    if (input[prop] !== undefined && !deepEquals(input[prop], known[prop])) {
      differingProps.push(prop);
    }
  }
  for (let prop of entityProps) {
    if (input[prop] !== undefined && !input[prop].id) {
      let targetID = input[prop].id as string;
      let expected = (known[prop] as unknown as Entity | undefined)?.id;
      if (targetID !== expected) {
        differingProps.push(prop);
      }
    }
  }
  for (let prop of entityListProps) {
    if (input[prop] !== undefined) {
      let target = input[prop] as { id?: string }[];
      let expected = (known[prop] as unknown as Entity[]) ?? [];
      if (target.length !== expected.length) {
        differingProps.push(prop);
      } else if (
        target.some(({ id: targetID }, i) => {
          let expectedID = expected[i].id;
          return targetID !== expectedID;
        })
      ) {
        differingProps.push(prop);
      }
    }
  }
  return differingProps;
}

function bundlePromises<E extends Entity>(
  name: EntityName,
  promises: Promise<ImportResult<E>>[] | Promise<ImportResult<E>>
): Promise<[EntityName, ImportResult<E>[]]> {
  return Promise.all([
    name,
    Promise.all(Array.isArray(promises) ? promises : [promises]),
  ]);
}

const makeImportResult = <E extends Entity>(
  type: EntityName,
  id: string
): ImportResult<E> => ({
  type,
  id,
  name: "",
  exists: false,
  isOlder: false,
  hasConflict: false,
  differingProperties: [],
  children: {},
  entity: undefined,
});

function importInit<E extends Entity>(
  data: Record<string, any>,
  options: ImportOptions,
  trace: string,
  idSet: Set<String>,
  type: EntityName
): {
  dryRun: boolean;
  overwrite: boolean;
  forceNew: boolean;
  useExisting: boolean;
  result: ImportResult<E>;
  typeAssert: TypeAssertFunction<typeof data>;
} {
  if (!hasId(data)) {
    throw new Error(`[${trace}|id] missing id.`);
  }
  if (idSet.has(data.id)) {
    throw new Error(`[${trace}|id] more than one entity with id ${data.id}!`);
  }
  data;
  idSet.add(data.id);
  let { dryRun } = options;
  let { overwrite, forceNew, useExisting } = getOptions(options, type, data.id);
  let result: ImportResult<E> = makeImportResult(type, data.id);
  let typeAssert = typeAssertWrapper(trace);
  return { dryRun, overwrite, forceNew, result, typeAssert, useExisting };
}

async function importChildren<T extends Entity>(
  data: Record<string, any>[],
  options: ImportOptions,
  trace: string,
  idSet: Set<String>,
  importer: (
    data: Record<string, any>,
    options: ImportOptions,
    trace: string,
    idSet: Set<String>
  ) => Promise<ImportResult<T>>
): Promise<[T[], ImportResult<T>[]]> {
  let results = (
    await Promise.all(
      data.map((elementData, i) =>
        importer(elementData, options, `${trace}[${i}]`, idSet)
      )
    )
  ).map((result, i) => {
    if (!result.entity) {
      throw new Error(
        `[${trace}[${i}]|use] Expected to receive entity from import!`
      );
    }
    return [result.entity, result] as [T, ImportResult<T>];
  });
  return [
    results.map(([entity]) => entity),
    results.map(([_, result]) => result),
  ];
}

const weekdayEnum = [0, 1, 2, 3, 4, 5, 6];
export async function importAsyncProject(
  data: Record<string, any>,
  options: ImportOptions,
  trace: string = "Root(AsyncProject)",
  idSet: Set<String> = new Set()
): Promise<ImportResult<AsyncProject>> {
  let { dryRun, overwrite, forceNew, useExisting, result, typeAssert } =
    importInit<AsyncProject>(data, options, trace, idSet, "AsyncProject");
  if (!hasId(data)) throw new Error("Unreachable!");

  // convert date properties
  datifyProperties(data, ["created", "modified"], trace);

  // validate all types
  if (
    !typeAssert(data, "active", typeIsBoolean, false) ||
    !typeAssert(data, "created", typeIsDate, false) ||
    !typeAssert(data, "description", typeIsString, false) ||
    !typeAssert(data, "designModel", typeIsRecord, true) ||
    !typeAssert(data, "entries", typeIsArrayOf(typeIsRecord), true) ||
    !typeAssert(data, "modified", typeIsDate, false) ||
    !typeAssert(data, "name", typeIsNonemptyString, true) ||
    !typeAssert(data, "notes", typeIsArrayOf(typeIsRecord), false) ||
    !typeAssert(data, "periodAlignment", typeIsEnum(weekdayEnum), false) ||
    !typeAssert(data, "reportingPeriod", typeIsEnum(["day", "week"] as const), true)
  )
    throw new Error("Unreachable!");

  result.name = data.name;

  // check for existing projects with the same id
  if (!forceNew) {
    let project: AsyncProject;
    try {
      let lookup = await getProjectOrFail(data.id);
      if (lookup[0] === "RealtimeProject") {
        result.hasConflict = true;
        if (!dryRun) {
          throw new Error(
            `[${trace}|check-existing] Conflicts with existing project (wrong project type!)`
          );
        }
      } else {
        // found another AsyncProject with the same id
        project = lookup[1];
        result.exists = true;
        result.differingProperties = findDifferingProperties(
          data,
          project,
          [
            "active",
            "created",
            "description",
            "modified",
            "name",
            "periodAlignment",
            "reportingPeriod",
          ],
          ["designModel"],
          ["entries", "notes"]
        );
        if (
          result.differingProperties.includes("modified") &&
          data.modified &&
          data.modified < project.modified
        ) {
          result.isOlder = true;
        }
      }
    } catch (e) {
      // no project is a good thing! all clear :)
    }
  }

  if (dryRun) {
    let testPromises: Promise<[EntityName, ImportResult<any>[]]>[] = [];
    testPromises.push(
      bundlePromises(
        "AsyncEntry",
        data.entries.map((entryData, i) =>
          importAsyncEntry(entryData, options, `${trace}:entries[${i}]`, idSet)
        )
      )
    );
    if (data.notes) {
      testPromises.push(
        bundlePromises(
          "ProjectNote",
          data.notes.map((entryData, i) =>
            importProjectNote(entryData, options, `${trace}:notes[${i}]`, idSet)
          )
        )
      );
    }
    testPromises.push(
      bundlePromises(
        "DesignModel",
        importDesignModel(
          data.designModel,
          options,
          `${trace}:designModel`,
          idSet
        )
      )
    );

    let childResults = await Promise.all(testPromises);
    result.children = Object.fromEntries(childResults);
  } else {
    let project: AsyncProject | undefined = undefined;
    if (result.hasConflict && !forceNew) {
      throw new Error(
        `[${trace}|create] Cannot import: Existing entity conflicts!`
      );
    }
    if (
      result.differingProperties.length > 0 &&
      !(overwrite || forceNew || useExisting)
    ) {
      throw new Error(
        `[${trace}|create] Entity exists and differs, but overwrite is false!`
      );
    }
    // if forceNew, result.exists is always false, so we'll
    // correctly create the new entity in the next branch
    if (result.exists) {
      project = await getAsyncProject(data.id);
    }
    if (useExisting) {
      if (!project) {
        throw new Error(`[${trace}|useExisting] No existing entity!`);
      }
    } else {
      if (!project) {
        project = newAsyncProject();
      }
      if (data.active !== undefined) project.active = data.active;
      if (data.created) project.created = data.created;
      if (data.description) project.description = data.description;
      if (data.modified) project.modified = data.modified;
      if (forceNew) {
        project.name = data.name + " (Copy)";
      } else {
        project.name = data.name;
      }
      if (data.periodAlignment) project.periodAlignment = data.periodAlignment;
      project.reportingPeriod = data.reportingPeriod;

      console.log("STEP 1: about to import design model");
      let designModelResult = await importDesignModel(
        data.designModel,
        options,
        `${trace}:designModel`,
        idSet
      );
      console.log("STEP 2: design model imported", designModelResult.entity?.id);
      if (!designModelResult.entity) {
        throw new Error(
          `[${trace}:designModel] Expected to receive entity from import!`
        );
      }
      result.children.DesignModel = [designModelResult];
      project.designModel = designModelResult.entity;

      const uid = getUid();
      if (uid && !project.ownerUid) {
        project.ownerUid = uid;
      }
      console.log("STEP 3: about to save project, ownerUid:", project.ownerUid, "uid:", uid);

      if (forceNew) {
        await project.save();
      } else {
        await saveEntityWithId(project, data.id);
      }
      console.log("STEP 4: Project saved with id:", project.id);

      if (uid) {
        const membershipRef = doc(
          db,
          "projectMembers",
          `${uid}_${project.id}`
        );
        const existingMembership = await getDoc(membershipRef);
        console.log(
          "STEP 5: existingMembership.exists():",
          existingMembership.exists()
        );
        if (!existingMembership.exists()) {
          await setDoc(membershipRef, {
            projectId: project.id,
            uid,
            role: "owner",
            status: "active",
            joinedAt: serverTimestamp(),
          });
          console.log("STEP 6: membership setDoc succeeded");
        }
      }

      console.log(
        "STEP 7: about to import entries, count:",
        data.entries.length
      );
      let [entries, entryResults] = await importChildren(
        data.entries,
        options,
        `${trace}:entries`,
        idSet,
        (entryData, opts, tr, ids) =>
          importAsyncEntry(entryData, opts, tr, ids, project!.id)
      );
      console.log("STEP 8: entries imported", entries.length);
      entries.forEach((entry) => {
        entry.projectId = project!.id;
      });
      await Promise.all(entries.map((entry) => entry.save()));
      console.log("STEP 9: entries saved with projectId");
      project.entries = entries;
      result.children.AsyncEntry = entryResults;

      if (data.notes) {
        console.log(
          "STEP 10: about to import notes, count:",
          data.notes.length
        );
        let [notes, noteResults] = await importChildren(
          data.notes,
          options,
          `${trace}:notes`,
          idSet,
          importProjectNote
        );
        notes.forEach((note) => {
          note.projectId = project!.id;
        });
        await Promise.all(notes.map((note) => note.save()));
        console.log("STEP 11: notes saved with projectId");
        project.notes = notes;
        result.children.ProjectNote = noteResults;
      } else {
        result.children.ProjectNote = [];
      }

      console.log("STEP 12: about to do final project save");
      await project.save();
      console.log("STEP 13: final save complete");
    }
    result.entity = project;
  }
  return result;
}

export async function importAsyncEntry(
  data: Record<string, any>,
  options: ImportOptions,
  trace: string = "Root(AsyncEntry)",
  idSet: Set<String> = new Set(),
  projectId?: string
): Promise<ImportResult<AsyncEntry>> {
  let { dryRun, overwrite, forceNew, useExisting, result, typeAssert } =
    importInit<AsyncEntry>(data, options, trace, idSet, "AsyncEntry");
  if (!hasId(data)) throw new Error("Unreachable!");

  // convert date properties
  datifyProperties(data, ["created", "modified", "period"], trace);

  // validate all types
  if (
    !typeAssert(data, "created", typeIsDate, false) ||
    !typeAssert(
      data,
      "data",
      typeIsArrayOf(
        typeSatisfiesAll<{ note?: string; value: number }>(
          typeIsRecord,
          checkOptionalProperty("note", typeIsString),
          checkProperty("value", typeIsNumber)
        )
      ),
      true
    ) ||
    !typeAssert(data, "modified", typeIsDate, false) ||
    !typeAssert(data, "note", typeIsString, false) ||
    !typeAssert(data, "period", typeIsDate, true)
  )
    throw new Error("Unreachable!");

  if (!forceNew) {
    let entry = await getAsyncEntry(data.id);
    if (entry) {
      result.exists = true;
      result.differingProperties = findDifferingProperties(
        data,
        entry,
        ["created", "data", "modified", "note", "period"],
        [],
        []
      );
      if (result.differingProperties.includes("modified") && data.modified) {
        // check if the importee is older
        if (data.modified < entry.modified) {
          result.isOlder = true;
        }
      }
    }
  }

  if (!dryRun) {
    let entry: AsyncEntry | undefined = undefined;
    if (
      result.differingProperties.length > 0 &&
      !(overwrite || forceNew || useExisting)
    ) {
      throw new Error(
        `[${trace}|create] Entity exists and differs, but overwrite is false!`
      );
    }
    // if forceNew, result.exists is always false, so we'll
    // correctly create the new entity in the next branch
    if (result.exists) {
      entry = await getAsyncEntry(data.id);
    }
    if (useExisting) {
      if (!entry) {
        throw new Error(`[${trace}|useExisting] No existing entity!`);
      }
    } else {
      if (!entry) {
        entry = newAsyncEntry();
      }
      if (projectId) entry.projectId = projectId;
      if (data.created) entry.created = data.created;
      entry.data = data.data.map(({ note, value }) => ({
        note: note ?? "",
        value,
      }));
      if (data.modified) entry.modified = data.modified;
      if (data.note) entry.note = data.note;
      entry.period = data.period;

      if (forceNew) {
        await entry.save();
      } else {
        await saveEntityWithId(entry, data.id);
      }
    }

    result.entity = entry;

  }

  return result;
}

let typeIsActivity = typeSatisfiesAll(
  typeIsRecord,
  checkProperty("code", typeIsNonemptyString),
  checkProperty("color", typeIsColorTuple),
  checkOptionalProperty("description", typeIsString),
  checkProperty("name", typeIsNonemptyString)
);
let typeIsDesignModelDescription = typeSatisfiesAll(
  typeIsRecord,
  checkOptionalProperty("citation", typeIsString),
  checkProperty("description", typeIsString),
  checkOptionalProperty(
    "imageURL",
    typeSatisfiesAny<string | string[]>(
      typeIsString,
      typeIsArrayOf(typeIsString)
    )
  ),
  checkOptionalProperty("moreInfoURL", typeIsString)
);

export async function importDesignModel(
  data: Record<string, any>,
  options: ImportOptions,
  trace: string = "Root(DesignModel)",
  idSet: Set<String> = new Set()
): Promise<ImportResult<DesignModel>> {
  let { dryRun, overwrite, forceNew, useExisting, result, typeAssert } =
    importInit<DesignModel>(data, options, trace, idSet, "DesignModel");
  if (!hasId(data)) throw new Error("Unreachable!");

  if (
    !typeAssert(data, "activities", typeIsArrayOf(typeIsActivity), true) ||
    !typeAssert(
      data,
      "description",
      typeSatisfiesAny(typeIsNull, typeIsDesignModelDescription),
      false
    ) ||
    !typeAssert(data, "name", typeIsNonemptyString, true) ||
    !typeAssert(data, "wellKnown", typeIsBoolean, false)
  )
    throw new Error("Unreachable!");

  result.name = data.name;

  if (!forceNew) {
    let model = await getDesignModel(data.id);
    if (model) {
      result.exists = true;
      result.differingProperties = findDifferingProperties(
        data,
        model,
        ["activities", "description", "id", "name", "wellKnown"],
        [],
        []
      );
    }
  }

  if (!dryRun) {
    let model: DesignModel | undefined = undefined;
    if (
      result.differingProperties.length > 0 &&
      !(overwrite || forceNew || useExisting)
    ) {
      throw new Error(
        `[${trace}|create] Entity exists and differs, but overwrite is false!`
      );
    }
    // if forceNew, result.exists is always false, so we'll
    // correctly create the new entity in the next branch
    if (result.exists) {
      model = await getDesignModel(data.id);
    }
    if (useExisting) {
      if (!model) {
        throw new Error(`[${trace}|useExisting] No existing entity!`);
      }
    } else {
      if (!model) {
        model = newDesignModel();
      }
      let existingActivities = model.activities;
      model.activities = data.activities.map(
        ({ code, color, description, name }, i) => ({
          code: code.toUpperCase(),
          color,
          description: description ?? existingActivities[i]?.description ?? "",
          name,
        })
      );
      if (data.description !== undefined)
        model.description = deepClone<any>(data.description);
      model.name = data.name;
      // FIXME?: since well known activity sets are trusted in certain contexts
      // (e.g., to load external images), allowing imported models to set this
      // property could expose very limited user information (just IP and
      // possibly behavior patterns?) to third parties, or change link URLs
      // (users probably won't be expecting to enter personal information, so
      // there doesn't seem like a large phishing risk. still, it might be a
      // good idea to add a popup when these links go to unverified origins.)
      // Anyway, we're ignoring what the imported model reported, if any,
      // and checking the id prefix instead.
      model.wellKnown = data.id.startsWith("well-known:");

      if (forceNew) {
        await model.save();
      } else {
        await saveEntityWithId(model, data.id);
      }
    }
    result.entity = model;
  }

  return result;
}

export async function importProjectNote(
  data: Record<string, any>,
  options: ImportOptions,
  trace: string = "Root(ProjectNote)",
  idSet: Set<String> = new Set(),
  projectId?: string
): Promise<ImportResult<ProjectNote>> {
  let { dryRun, overwrite, forceNew, useExisting, result, typeAssert } =
    importInit<ProjectNote>(data, options, trace, idSet, "ProjectNote");
  if (!hasId(data)) throw new Error("Unreachable!");

  datifyProperties(data, ["created"], trace);

  if (
    !typeAssert(data, "content", typeIsString, true) ||
    !typeAssert(data, "created", typeIsDate, false)
  )
    throw new Error("Unreachable!");

  if (!forceNew) {
    let note = await getProjectNote(data.id);
    if (note) {
      result.exists = true;
      result.differingProperties = findDifferingProperties(
        data,
        note,
        ["content", "created"],
        [],
        []
      );
    }
  }

  if (!dryRun) {
    let note: ProjectNote | undefined = undefined;
    if (
      result.differingProperties.length > 0 &&
      !(overwrite || forceNew || useExisting)
    ) {
      throw new Error(
        `[${trace}|create] Entity exists and differs, but overwrite is false!`
      );
    }
    // if forceNew, result.exists is always false, so we'll
    // correctly create the new entity in the next branch
    if (result.exists) {
      note = await getProjectNote(data.id);
    }
    if (useExisting) {
      if (!note) {
        throw new Error(`[${trace}|useExisting] No existing entity!`);
      }
    } else {
      if (!note) {
        note = newProjectNote();
      }
      if (projectId) note.projectId = projectId;
      note.content = data.content;
      note.content = data.content;
      if (data.created) note.created = data.created;
      if (forceNew) {
        await note.save();
      } else {
        await saveEntityWithId(note, data.id);
      }
    }
    result.entity = note;
  }

  return result;
}

export async function importRealtimeProject(
  data: Record<string, any>,
  options: ImportOptions,
  trace: string = "Root(RealtimeProject)",
  idSet: Set<String> = new Set()
): Promise<ImportResult<RealtimeProject>> {
  let { dryRun, overwrite, forceNew, useExisting, result, typeAssert } =
    importInit<RealtimeProject>(data, options, trace, idSet, "RealtimeProject");
  if (!hasId(data)) throw new Error("Unreachable!");

  datifyProperties(data, ["created", "modified"], trace);

  if (
    !typeAssert(data, "active", typeIsBoolean, false) ||
    !typeAssert(data, "created", typeIsDate, false) ||
    !typeAssert(data, "description", typeIsString, false) ||
    !typeAssert(data, "designModel", typeIsRecord, true) ||
    !typeAssert(data, "modified", typeIsDate, false) ||
    !typeAssert(data, "name", typeIsNonemptyString, true) ||
    !typeAssert(data, "notes", typeIsArrayOf(typeIsRecord), false) ||
    !typeAssert(data, "sessions", typeIsArrayOf(typeIsRecord), true)
  )
    throw new Error("Unreachable!");

  result.name = data.name;

  if (!forceNew) {
    let project: RealtimeProject;
    try {
      let lookup = await getProjectOrFail(data.id);
      if (lookup[0] === "AsyncProject") {
        result.hasConflict = true;
        if (!dryRun) {
          throw new Error(
            `[${trace}|check-existing] Conflicts with existing project (wrong project type!)`
          );
        }
      } else {
        project = lookup[1];
        result.exists = true;
        result.differingProperties = findDifferingProperties(
          data,
          project,
          ["active", "created", "description", "modified", "name"],
          ["designModel"],
          ["notes", "sessions"]
        );
        if (
          result.differingProperties.includes("modified") &&
          data.modified &&
          data.modified < project.modified
        ) {
          result.isOlder = true;
        }
      }
    } catch (e) {
      // no project is a good thing! all clear :)
    }
  }

  if (dryRun) {
    let testPromises: Promise<[EntityName, ImportResult<any>[]]>[] = [];
    testPromises.push(
      bundlePromises(
        "RealtimeSession",
        data.sessions.map((sessionData, i) =>
          importRealtimeSession(
            sessionData,
            options,
            `${trace}:sessions[${i}]`,
            idSet
          )
        )
      )
    );
    if (data.notes) {
      testPromises.push(
        bundlePromises(
          "ProjectNote",
          data.notes.map((entryData, i) =>
            importProjectNote(entryData, options, `${trace}:notes[${i}]`, idSet)
          )
        )
      );
    }
    testPromises.push(
      bundlePromises(
        "DesignModel",
        importDesignModel(
          data.designModel,
          options,
          `${trace}:designModel`,
          idSet
        )
      )
    );
    let childResults = await Promise.all(testPromises);
    result.children = Object.fromEntries(childResults);
  } else {
    let project: RealtimeProject | undefined = undefined;
    if (result.hasConflict && !forceNew) {
      throw new Error(
        `[${trace}|create] Cannot import: Existing entity conflicts!`
      );
    }
    if (
      result.differingProperties.length > 0 &&
      !(overwrite || forceNew || useExisting)
    ) {
      throw new Error(
        `[${trace}|create] Entity exists and differs, but overwrite is false!`
      );
    }
    // if forceNew, result.exists is always false, so we'll
    // correctly create the new entity in the next branch
    if (result.exists) {
      project = await getRealtimeProject(data.id);
    }
    if (useExisting) {
      if (!project) {
        throw new Error(`[${trace}|useExisting] No existing entity!`);
      }
      } else {
      if (!project) {
        project = newRealtimeProject();
      }
      if (data.active !== undefined) project.active = data.active;
      if (data.created) project.created = data.created;
      if (data.description) project.description = data.description;
      if (data.modified) project.modified = data.modified;
      if (forceNew) {
        project.name = data.name + " (Copy)";
      } else {
        project.name = data.name;
      }

      // Import the design model first -- needed on the project before its
      // first save, and doesn't depend on the project having an id yet.
      let designModelResult = await importDesignModel(
        data.designModel,
        options,
        `${trace}:designModel`,
        idSet
      );
      if (!designModelResult.entity) {
        throw new Error(
          `[${trace}:designModel] Expected to receive entity from import!`
        );
      }
      result.children.DesignModel = [designModelResult];
      project.designModel = designModelResult.entity;

      // Set ownership BEFORE the first save, so the create write itself
      // satisfies the security rule (which checks ownerUid at create time).
      const uid = getUid();
      if (uid && !project.ownerUid) {
        project.ownerUid = uid;
      }

      // Save the project now, BEFORE importing notes/sessions below, so it
      // has its final real id (a fresh one if forceNew) and so ownership +
      // membership can be established before any child entity tries to
      // save -- child entities' security rules require project membership
      // to already exist.
      if (forceNew) {
        await project.save();
      } else {
        await saveEntityWithId(project, data.id);
      }

      if (uid) {
        const membershipRef = doc(db, "projectMembers", `${uid}_${project.id}`);
        const existingMembership = await getDoc(membershipRef);
        if (!existingMembership.exists()) {
          await setDoc(membershipRef, {
            projectId: project.id,
            uid,
            role: "owner",
            status: "active",
            joinedAt: serverTimestamp(),
          });
        }
      }

      // Now that the project is saved and membership exists, it's safe to
      // import notes and sessions, which each set their own projectId and
      // are checked against project membership by security rules.
      if (data.notes) {
        let [notes, noteResults] = await importChildren(
          data.notes,
          options,
          `${trace}:notes`,
          idSet,
          (noteData, opts, tr, ids) =>
            importProjectNote(noteData, opts, tr, ids, project!.id)
        );
        notes.forEach((note) => {
          note.projectId = project!.id;
        });
        await Promise.all(notes.map((note) => note.save()));
        project.notes = notes;
        result.children.ProjectNote = noteResults;
      } else {
        result.children.ProjectNote = [];
      }

      let [sessions, sessionResults] = await importChildren(
        data.sessions,
        options,
        `${trace}:sessions`,
        idSet,
        importRealtimeSession
      );
      sessions.forEach((session) => {
        session.projectId = project!.id;
      });
      await Promise.all(sessions.map((session) => session.save()));
      project.sessions = sessions;
      result.children.RealtimeSession = sessionResults;

      // Final save to persist the notes/sessions id arrays on the project.
      await project.save();
    }
    result.entity = project;
  }
  return result;
}

const typeIsRealtimeActivityRecord = typeIsArrayOf(typeIsNumberPair);

export async function importRealtimeSession(
  data: Record<string, any>,
  options: ImportOptions,
  trace: string = "Root(RealtimeSession)",
  idSet: Set<String> = new Set()
): Promise<ImportResult<RealtimeSession>> {
  let { dryRun, overwrite, forceNew, useExisting, result, typeAssert } =
    importInit<RealtimeSession>(data, options, trace, idSet, "RealtimeSession");
  if (!hasId(data)) throw new Error("Unreachable!");

  datifyProperties(data, ["start"], trace);

  if (
    !typeAssert(
      data,
      "data",
      typeIsArrayOf(typeIsRealtimeActivityRecord),
      true
    ) ||
    !typeAssert(data, "duration", typeIsNumber, true) ||
    !typeAssert(data, "notes", typeIsArrayOf(typeIsRecord), false) ||
    !typeAssert(data, "start", typeIsDate, true)
  )
    throw new Error("Unreachable!");

  if (!forceNew) {
    let session = await getRealtimeSession(data.id);
    if (session) {
      result.exists = true;
      result.differingProperties = findDifferingProperties(
        data,
        session,
        ["data", "duration", "start"],
        [],
        ["notes"]
      );
    }
  }

  if (dryRun) {
    if (data.notes) {
      result.children.TimedNote = await Promise.all(
        data.notes.map((noteData, i) =>
          importTimedNote(noteData, options, `${trace}:notes[${i}]`, idSet)
        )
      );
    } else {
      result.children.TimedNote = [];
    }
  } else {
    let session: RealtimeSession | undefined = undefined;
    if (
      result.differingProperties.length > 0 &&
      !(overwrite || forceNew || useExisting)
    ) {
      throw new Error(
        `[${trace}|create] Entity exists and differs, but overwrite is false!`
      );
    }
    // if forceNew, result.exists is always false, so we'll
    // correctly create the new entity in the next branch
    if (result.exists) {
      session = await getRealtimeSession(data.id);
    }
    if (useExisting) {
      if (!session) {
        throw new Error(`[${trace}|useExisting] No existing entity!`);
      }
    } else {
      if (!session) {
        session = newRealtimeSession();
      }
      session.data = deepClone(data.data);
      session.duration = data.duration;
      if (data.notes) {
        let [notes, noteResults] = await importChildren(
          data.notes,
          options,
          `${trace}:notes`,
          idSet,
          importTimedNote
        );
        session.notes = notes;
        result.children.TimedNote = noteResults;
      } else {
        result.children.TimedNote = [];
      }
      if (forceNew) {
        await session.save();
      } else {
        await saveEntityWithId(session, data.id);
      }

       await Promise.all(
        session.notes.map(async (note) => {
          if (note.sessionId !== session!.id) {
            note.sessionId = session!.id;
            await note.save();
          }
        })
      );
    }
    result.entity = session;
  }

  return result;
}

export async function importTimedNote(
  data: Record<string, any>,
  options: ImportOptions,
  trace: string = "Root(TimedNote)",
  idSet: Set<String> = new Set()
): Promise<ImportResult<TimedNote>> {
  let { dryRun, overwrite, forceNew, useExisting, result, typeAssert } =
    importInit<TimedNote>(data, options, trace, idSet, "TimedNote");
  if (!hasId(data)) throw new Error("Unreachable!");

  datifyProperties(data, ["created"], trace);

  if (
    !typeAssert(data, "content", typeIsString, true) ||
    !typeAssert(data, "created", typeIsDate, false) ||
    !typeAssert(data, "time", typeIsNumber, true)
  )
    throw new Error("Unreachable!");

  if (!forceNew) {
    let note = await getTimedNote(data.id);
    if (note) {
      result.exists = true;
      result.differingProperties = findDifferingProperties(
        data,
        note,
        ["content", "created", "time"],
        [],
        []
      );
    }
  }

  if (!dryRun) {
    let note: TimedNote | undefined = undefined;
    if (
      result.differingProperties.length > 0 &&
      !(overwrite || forceNew || useExisting)
    ) {
      throw new Error(
        `[${trace}|create] Entity exists and differs, but overwrite is false!`
      );
    }
    // if forceNew, result.exists is always false, so we'll
    // correctly create the new entity in the next branch
    if (result.exists) {
      note = await getTimedNote(data.id);
    }
    if (useExisting) {
      if (!note) {
        throw new Error(`[${trace}|useExisting] No existing entity!`);
      }
    } else {
      if (!note) {
        note = newTimedNote();
      }
      note.content = data.content;
      if (data.created) note.created = data.created;
      note.time = data.time;
      if (forceNew) {
        await note.save();
      } else {
        await saveEntityWithId(note, data.id);
      }
    }
    result.entity = note;
  }

  return result;
}
