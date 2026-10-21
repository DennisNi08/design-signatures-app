<!--
  Copyright (c) 2021, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts">
  import addIcon from "@iconify-icons/ic/baseline-add";
  import { pop, push, router } from "svelte-spa-router";
  import { newProjectNote } from "../data/database";
  import type {
    AsyncProject,
    ProjectNote,
    RealtimeProject,
  } from "../data/schema";
  import { querystring } from "../util/routerState";
  import { sortBy } from "../util/sort";
  import Button from "./Button.svelte";
  import InputField from "./InputField.svelte";
  import Modal from "./Modal.svelte";
  import Header from "./type/Header.svelte";

  export let project: AsyncProject | RealtimeProject;

  let activeNote: ProjectNote | null = null;
  let activeNoteContent = "";
  let activeNoteIsNew = false;

  function newNote() {
    activeNote = newProjectNote();
    activeNote.projectId = project.id;
    activeNoteContent = "";
    activeNoteIsNew = true;
    open();
  }
  const edit = (note: ProjectNote) => () => {
    activeNote = note;
    activeNoteContent = note.content;
    activeNoteIsNew = false;
    open();
  };
  function open() {
    if (router.querystring !== "note") {
      push(`/projects/${project.id}/?note`);
    }
  }
  let isSaving: boolean = false;
  async function save() {
    if (activeNote) {
      isSaving = true;
      activeNoteContent = activeNoteContent.trim();
      if (activeNoteContent) {
        activeNote.content = activeNoteContent;
        if (activeNoteIsNew) {
          project.notes = [activeNote, ...project.notes];
          await project.save();
        } else {
          await activeNote.save();
          project.notes = project.notes;
        }
      } else if (!activeNoteIsNew) {
        // cleared text of an existing note - let's delete this note
        // FIXME: should have a more obvious way to delete notes than clearing
        // out the text?
        project.notes = project.notes.filter((note) => note !== activeNote);
        await activeNote.remove();
        await project.save();
      }
    }
    await close();
    isSaving = false;
  }
  async function close() {
    activeNote = null;
    if (router.querystring === "note") {
      await pop();
    }
  }
  // in case it's open when the component is rendered:
  close();
</script>

<Header>Project Notes</Header>
<div class="notes">
  {#if project.active}
    <Button small icon={addIcon} on:click={newNote}>Add note</Button>
  {/if}
  {#each sortBy("created", project.notes, false) as note}
    <button class="note" on:click={edit(note)}>
      <div class="note-meta">
        {note.created.toLocaleDateString(undefined, {
          day: "numeric",
          month: "numeric",
          year: "2-digit",
        })}
        {note.created.toLocaleString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })}
      </div>
      <div class="content">{note.content}</div>
    </button>
  {/each}
</div>
{#if project.active}
  <Modal
    maxWidth
    visible={$querystring === "note"}
    closeWithScrim={false}
    title={activeNoteIsNew ? "New Note" : "Edit Note"}
    buttons={[
      { label: "Cancel", onClick: close, disabled: isSaving },
      { label: "Save", onClick: save, disabled: isSaving },
    ]}
  >
    <InputField large xlarge bind:value={activeNoteContent} label="" />
  </Modal>
{/if}

<style lang="scss">
  @use "src/styles/tokens" as *;
  @use "src/styles/type" as *;
  .notes {
    margin: 1rem 0;
  }
  .note {
    appearance: none;
    -webkit-appearance: none;
    background: transparent;
    border: 0;
    text-align: left;
    margin: 1rem 0;
    padding: 0;
  }
  .note-meta {
    @include type-style($type-note-meta);
    color: $text-secondary-color;
  }
  .content {
    @include type-style($type-body);
    color: $text-primary-color;
  }
</style>
