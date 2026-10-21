<!--
  Copyright (c) 2021, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts">
  import BackButton from "../components/BackButton.svelte";
  import Button from "../components/Button.svelte";
  import ContentFrame from "../components/layout/ContentFrame.svelte";
  import Link from "../components/Link.svelte";
  import PageSeparator from "../components/PageSeparator.svelte";
  import Header from "../components/type/Header.svelte";
  import SectionHeader from "../components/type/SectionHeader.svelte";
  import type { ImportOptions, ImportResult } from "../data/import";
  import { importAsyncProject, importRealtimeProject } from "../data/import";
  import { pushRecentProject } from "../data/recentProjects";
  import type {
    AsyncProject,
    EntityName,
    RealtimeProject,
  } from "../data/schema";
  import { deepClone } from "../util/deepObject";
  import { checkProperty, typeIsRecord } from "../util/runtimeTypecheck";

  type ImportState =
    | "empty"
    | "reading"
    | "invalid"
    | "checking"
    | "confirm"
    | "importing"
    | "done";

  let state: ImportState = "empty";
  let filename: string = "";
  let err: string = "";
  let errDetail: string = "";
  let showErr = false;

  let fileInput: HTMLInputElement | undefined;
  function chooseFile() {
    fileInput?.click();
  }

  function bail(reason: string, detail?: string) {
    state = "invalid";
    err = reason;
    showErr = false;
    errDetail = detail || "";
  }

  let importer: (
    data: Record<string, any>,
    options: ImportOptions
  ) => Promise<ImportResult<any>>;

  let rawData: any;
  async function selectFile() {
    if (!(state === "empty" || state === "invalid")) return;
    if (!fileInput) return;
    const files = fileInput.files;
    if (!files || files.length < 1) return;
    const [file] = files;
    filename = file.name;
    state = "reading";
    let body = await file.text();
    let data: any;
    try {
      data = JSON.parse(body);
      rawData = data;
    } catch (e) {
      return bail(
        "Failed to parse JSON.",
        e instanceof Error ? e.message : undefined
      );
    }
    if (!typeIsRecord(data)) {
      return bail(
        "Data is not in the Design Signatures format.",
        "Expected top level object, but got " +
          (Array.isArray(data) ? "array" : typeof data) +
          " instead."
      );
    }
    if (data.$format !== "design-awareness") {
      return bail(
        "Data is not in the Design Signatures format.",
        "Missing top level $format key."
      );
    }
    if (data.version !== "1.0.0") {
      return bail(
        "Data is not in the Design Signatures format.",
        "Missing or invalid file version (" + (data.version || "missing") + ")"
      );
    }
    if (!(data.type === "AsyncProject" || data.type === "RealtimeProject")) {
      return bail(
        "This file contains a missing or unsupported data type.",
        "Expected AsyncProject or RealtimeProject, but got " +
          (data.type || "(nothing)") +
          " instead."
      );
    }
    if (!checkProperty("data", typeIsRecord)(data)) {
      return bail(
        "This file doesn't contain any data.",
        "Expected object, but got " + (data.data || "(nothing)") + " instead."
      );
    }

    try {
      importer =
        data.type === "AsyncProject"
          ? importAsyncProject
          : importRealtimeProject;
      let result = await importer(deepClone(data.data), {
        dryRun: true,
        globalOptions: {},
        typeOptions: {},
        entityOptions: {},
      });
      buildDryRunResults(result);
    } catch (e) {
      errorStack = e instanceof Error ? e.stack : undefined;
      console.error(e);
      bail("This file can't be imported.", e instanceof Error ? e.message : undefined);
    }
  }

  // type EntityImportMode = "normal" | "overwrite" | "copy" | "preserve";

  // const IMPORT_MODE_LOOKUP: Record<EntityImportMode, string> = {
  //   copy: "Create a copy",
  //   normal: "Import",
  //   overwrite: "Replace existing",
  //   preserve: "Keep old only",
  // };

  const ENTITY_NAME_LOOKUP: Record<EntityName, string> = {
    AsyncEntry: "Entries",
    AsyncProject: "Project",
    DesignModel: "Design Model",
    ProjectNote: "Notes",
    RealtimeProject: "Project",
    RealtimeSession: "Sessions",
    TimedNote: "Session Notes",
  };

  function contentTypeLookup(projectType: EntityName): EntityName {
    if (projectType === "AsyncProject") {
      return "AsyncEntry";
    } else {
      return "RealtimeSession";
    }
  }

  let forceCopy = false;
  let designModelDecision: "copy" | "import" | "skip" = "import";

  interface EntityImportDescription {
    type: EntityName;
    name: string;
    message: string;
    isNew: boolean;
  }

  const makeImportDescription = (type: EntityName) => ({
    type,
    name: "",
    message: "",
    isNew: true,
  });

  let importDescriptionViews: EntityImportDescription[] = [];

  const coalesceResults = (
    results: ImportResult<any>[]
  ): {
    total: number;
    exist: number;
    differ: number;
    older: number;
  } =>
    results.reduce(
      ({ total, exist, differ, older }, nextResult) => ({
        total: total + 1,
        exist: exist + (nextResult.exists ? 1 : 0),
        differ: differ + (nextResult.differingProperties.length > 1 ? 1 : 0),
        older: older + (nextResult.isOlder ? 1 : 0),
      }),
      { total: 0, exist: 0, differ: 0, older: 0 }
    );

  function buildDryRunResults(
    result: ImportResult<AsyncProject> | ImportResult<RealtimeProject>
  ) {
    importDescriptionViews = [];

    // project description
    let projectDescription = makeImportDescription(result.type);
    projectDescription.name = result.name;
    forceCopy = false;
    if (
      result.hasConflict ||
      result.isOlder ||
      result.differingProperties.length > 0 ||
      result.exists // FIXME: should this be less aggressive?
    ) {
      forceCopy = true;
      projectDescription.message =
        "This project conflicts with one of your existing projects, " +
        "so a copy will be created.";
    }
    importDescriptionViews.push(projectDescription);

    // Sessions / Entries
    {
      let contentDescription = makeImportDescription(
        contentTypeLookup(result.type)
      );
      let { total, differ } = coalesceResults(
        result.children[contentTypeLookup(result.type)] ?? []
      );
      if (result.type === "AsyncProject") {
        contentDescription.name = total + " Entr" + (total === 1 ? "y" : "ies");
      } else {
        contentDescription.name = total + " Session" + (total === 1 ? "" : "s");
      }
      if (differ && !forceCopy) {
        forceCopy = true;
        projectDescription.isNew = true;
        if (total === 1) {
          contentDescription.message =
            "This differs from your existing " +
            (result.type === "AsyncProject" ? "entry" : "session") +
            ", so a copy of the project will be made.";
        } else {
          contentDescription.message =
            (differ === total ? "All" : differ) +
            " of these differ" +
            (differ === 1 ? "s" : "") +
            "from your existing " +
            (result.type === "AsyncProject" ? "entries" : "sessions") +
            ", so a copy of the project will be made.";
        }
      }
      importDescriptionViews.push(contentDescription);
    }

    if (result.children.ProjectNote?.length) {
      let notesDescription = makeImportDescription("ProjectNote");
      let { total, differ, exist } = coalesceResults(
        result.children.ProjectNote
      );
      notesDescription.name = total + " Note" + (total === 1 ? "" : "s");
      if (differ && !forceCopy) {
        forceCopy = true;
        projectDescription.isNew = true;
        if (total === 1) {
          notesDescription.message =
            "This differs from your existing note, " +
            "so a copy of the project will be made.";
        } else {
          notesDescription.message =
            (differ === total ? "All" : differ) +
            " of these differ" +
            (differ === 1 ? "s" : "") +
            "from your existing notes, so a copy of the project will be made.";
        }
      }
      importDescriptionViews.push(notesDescription);
    }

    // FIXME: Design model merging can also be more graceful! :)
    let designModelDescription = makeImportDescription("DesignModel");
    designModelDecision = "import";
    if (result.children.DesignModel) {
      let designModelResult = result.children.DesignModel[0];
      designModelDescription.name = designModelResult.name;
      if (designModelResult.differingProperties.length > 0) {
        designModelDecision = "copy";
        designModelDescription.message =
          "This design model conflicts with one of your existing models, " +
          "so a copy will be created.";
      } else if (designModelResult.exists) {
        designModelDecision = "skip";
        designModelDescription.isNew = false;
        designModelDescription.message = "You already have this design model.";
      }
    }
    importDescriptionViews.push(designModelDescription);

    state = "confirm";
  }

  let projectID: string = "";
  let errorStack: string | undefined = undefined;
 import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../data/firebase";
import { getUid } from "../data/authState.svelte";

async function doImport() {
  state = "importing";
  try {
    let { data } = rawData;
    let result = await importer(deepClone(data), {
      dryRun: false,
      globalOptions: {
        forceNew: forceCopy,
      },
      entityOptions: {},
      typeOptions: {
        DesignModel: {
          forceNew: designModelDecision === "copy",
          useExisting: designModelDecision === "skip",
        },
      },
    });
    if (!result.entity) {
      throw new Error(
        "Import: expected an entity to be returned after importing."
      );
    }

    if (result.entity.active) {
      pushRecentProject(result.entity.id);
    }
    projectID = result.entity.id;
    state = "done";
  } catch (e) {
    errorStack = e instanceof Error ? e.stack : undefined;
    console.error(e);
    bail(
      "An error occured while importing.",
      e instanceof Error ? e.message : undefined
    );
  }
}

  function copyStack() {
    if (errorStack) {
      navigator.clipboard?.writeText?.(errorStack);
    }
  }
</script>

<main class="device-frame page">
  <ContentFrame>
    <BackButton href="/" />
    <Header>Import</Header>
    {#if state === "empty" || state === "invalid"}
      <div class="button-area">
        <Button on:click={chooseFile}>Choose a file…</Button>
      </div>
    {:else}
      <p>{filename}</p>
    {/if}
    {#if state === "invalid"}
      <p class="status error">An error occurred with {filename}:</p>
      <p class="error-line">{err}</p>
      {#if errDetail}
        {#if showErr}
          <p class="error-detail status">{errDetail}</p>
          {#if errorStack}
            <pre>{errorStack}</pre>
          {/if}
        {/if}
        <div class="button-area">
          <Button small on:click={() => (showErr = !showErr)}
            >{showErr ? "Hide" : "Show"} details</Button
          >
          {#if showErr && errorStack}
            <Button small on:click={copyStack}>Copy to clipboard</Button>
          {/if}
        </div>
      {/if}
    {/if}
    {#if state === "reading"}
      <p class="status">Reading file…</p>
    {/if}
    {#if state === "confirm"}
      <PageSeparator />
      <SectionHeader>Import details</SectionHeader>
      {#each importDescriptionViews as { isNew, message, name, type }}
        <div class="import-detail-card" class:new={isNew}>
          <div class="card-header">{ENTITY_NAME_LOOKUP[type]}</div>
          <div class="card-name">{name}</div>
          {#if message}
            <div class="card-detail">{message}</div>
          {/if}
        </div>
      {/each}
      <div class="button-area">
        <Button on:click={doImport}>Import</Button>
      </div>
    {/if}
    {#if state === "importing"}
      <p class="status">Importing project…</p>
    {/if}
    {#if state === "done"}
      <p class="status">Importing complete!</p>
      <Link horizontal href="/projects/{projectID}">Go to your project</Link>
    {/if}
  </ContentFrame>
</main>

<input
  type="file"
  class="hidden-file-input"
  accept=".json"
  on:change={selectFile}
  bind:this={fileInput}
/>

<style lang="scss">
  @use "src/styles/tokens" as *;
  @use "src/styles/type" as *;

  .page {
    background-color: $background-color;
    min-height: 100%;
  }
  .hidden-file-input {
    display: none;
  }

  .button-area {
    margin: 1rem 0 2rem 0;
  }

  .status {
    @include type-style($type-detail);
    color: $text-secondary-color;
  }
  .error {
    color: $accent-danger-color;
  }
  .error-line {
    margin: 1rem 0 0.5rem 0;
  }
  .error-detail {
    margin: 0.5rem 0;
  }

  .import-detail-card {
    padding: 0.5rem 1rem;
    margin-bottom: 0.5rem;
    border-left: 4px solid $text-ghost-color;
    &.new {
      border-left-color: $text-actionable-color;
    }
  }
  .card-header {
    @include type-style($type-caption);
    color: $text-secondary-color;
    margin-bottom: 0.5rem;
  }
  .new .card-header {
    color: $text-actionable-color;
  }
  .card-name {
    color: $text-primary-color;
  }
  .card-detail {
    @include type-style($type-detail);
    color: $text-secondary-color;
    margin-top: 0.5rem;
  }

  pre {
    background-color: $alt-background-color;
    padding: 1rem;
    overflow: auto;
    @include type-style($type-caption);
    color: $text-secondary-color;
  }
</style>
