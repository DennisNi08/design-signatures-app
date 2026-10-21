<!--
  Copyright (c) 2021, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts">
  import archiveIcon from "@iconify-icons/ic/baseline-archive";
  import deleteIcon from "@iconify-icons/ic/baseline-delete";
  import editIcon from "@iconify-icons/ic/baseline-edit";
  import exportIcon from "@iconify-icons/ic/baseline-share";
  import inviteIcon from "@iconify-icons/ic/baseline-person-add";
  import publicIcon from "@iconify-icons/ic/baseline-public";
  import unarchiveIcon from "@iconify-icons/ic/baseline-unarchive";
  import { pop, push } from "svelte-spa-router";
  import {
    pushRecentProject,
    removeRecentProject,
  } from "../data/recentProjects";
  import type { AsyncProject, RealtimeProject } from "../data/schema";
  import { isAsyncProject} from "../types/utility"
  import { createInvite, getSentInvites, revokeInvite, type ProjectInvite } from "../data/invites";
  import Checkbox from "./Checkbox.svelte";
  import InputField from "./InputField.svelte";
  import Modal from "./Modal.svelte";
  import SegmentedSelector from "./SegmentedSelector.svelte";
  import type { PopupMenuDescriptor } from "./PopupMenu.svelte";
  import PopupMenu from "./PopupMenu.svelte";
  import { removeProjectMemberships } from "../data/database";
  import { downloadBlob } from "../util/download";
  import { generateTimelineSnapshot } from "../util/timelineSnapshot";

  export let project: AsyncProject | RealtimeProject;

  let editProjectOpen = false;
  let toggleProjectCompleteOpen = false;
  let deleteProjectOpen = false;
  let inviteOpen = false;
  let embedOpen = false;

  let menuDescriptor: PopupMenuDescriptor;
  function createMenuDescriptor() {
    menuDescriptor = [
      { label: "Edit", icon: editIcon, action: () => (editProjectOpen = true) },
      {
        label: "Invite",
        icon: inviteIcon,
        action: () => {
          inviteOpen = true;
          refreshSentInvites();
        },
      },
      {
        label: "Export",
        icon: exportIcon,
        action: () => push(`/projects/${project.id}/export`),
      },
      ...(isAsyncProject(project)
        ? [
            {
              label: "Embed",
              icon: publicIcon,
              action: () => (embedOpen = true),
            },
          ]
        : []),
      { separator: true },
      {
        label: project.active ? "Archive" : "Unarchive",
        icon: project.active ? archiveIcon : unarchiveIcon,
        action: () => (toggleProjectCompleteOpen = true),
      },
      {
        label: "Delete",
        icon: deleteIcon,
        class: "danger",
        action: () => (deleteProjectOpen = true),
      },
    ];
  }
  createMenuDescriptor();

  // edit
  let editName = project.name;
  let editDescription = project.description;
  function saveInfo() {
    editName = editName.trim();
    editDescription = editDescription.trim();
    if (editName === project.name && editDescription === project.description) {
      editProjectOpen = false;
      return;
    }
    if (!editName) editName = project.name;
    project.name = editName;
    project.description = editDescription;
    project.modified = new Date();
    editProjectOpen = false;
    project.save();
    if (project.active) {
      pushRecentProject(project.id);
    }
    project = project;
  }

  // archive
  async function toggleProjectComplete() {
    toggleProjectCompleteOpen = false;
    if (project.active) {
      project.active = false;
      removeRecentProject(project.id);
      project.save();
    } else {
      project.active = true;
      pushRecentProject(project.id);
      project.save();
    }
    project = project;
    createMenuDescriptor();
  }

  // delete
  let active = true
  async function remove() {
  active = false;
  const toRemove = [];
  toRemove.push(removeRecentProject(project.id));
  toRemove.push(removeProjectMemberships(project.id));
  project.notes.forEach((note) => toRemove.push(note.remove()));
  if (isAsyncProject(project)) {
    project.entries.forEach((entry) => toRemove.push(entry.remove()));
  } else {
    project.sessions.forEach((session) => toRemove.push(session.remove()));
  }
  toRemove.push(project.remove());
  await Promise.all(toRemove);
  pop();
}

  // invite
  let inviteEmail = "";
  let inviteRole: "editor" | "viewer" = "editor";
  let inviteSending = false;
  let inviteMessage: string | undefined;
  let sentInvites: ProjectInvite[] = [];
  let revokingId: string | undefined;

  async function refreshSentInvites() {
    sentInvites = await getSentInvites(project.id);
  }

  async function sendInvite() {
    if (!inviteEmail) return;
    inviteSending = true;
    inviteMessage = undefined;
    try {
      await createInvite(project.id, inviteEmail, inviteRole);
      inviteMessage = `Invited ${inviteEmail} as ${inviteRole}.`;
      inviteEmail = "";
      await refreshSentInvites();
    } catch (err) {
      inviteMessage =
        "Couldn't send invite: " +
        (err instanceof Error ? err.message : String(err));
    } finally {
      inviteSending = false;
    }
  }

  async function handleRevoke(invite: ProjectInvite) {
    revokingId = invite.id;
    try {
      await revokeInvite(invite);
      await refreshSentInvites();
    } finally {
      revokingId = undefined;
    }
  }

  // public embed
  let embedSaving = false;
  let embedCopied = false;
  $: embedUrl = `${location.origin}/#/embed/timeline/${project.id}`;
  async function setPublicShare(value: boolean) {
    if (!isAsyncProject(project)) return;
    embedSaving = true;
    try {
      project.publicShare = value;
      await project.save();
      project = project;
    } finally {
      embedSaving = false;
    }
  }
  async function copyEmbedUrl() {
    await navigator.clipboard.writeText(embedUrl);
    embedCopied = true;
    setTimeout(() => (embedCopied = false), 1500);
  }

  // static snapshot (PNG)
  let snapshotGenerating = false;
  let snapshotError: string | undefined;
  async function downloadSnapshot() {
    if (!isAsyncProject(project)) return;
    snapshotGenerating = true;
    snapshotError = undefined;
    try {
      const blob = await generateTimelineSnapshot(project);
      downloadBlob(`${safeName(project.name)}-timeline.png`, blob);
    } catch (err) {
      snapshotError =
        "Couldn't generate snapshot: " +
        (err instanceof Error ? err.message : String(err));
    } finally {
      snapshotGenerating = false;
    }
  }
  function safeName(name: string) {
    return name.trim().replace(/[\W\:\/\\]+/g, "-");
  }
</script>

<PopupMenu label="Options" descriptor={menuDescriptor} alignment="right" />

<Modal
  bind:visible={editProjectOpen}
  title="Edit Project"
  buttons={[{ label: "Save", onClick: saveInfo }]}
>
  <InputField label="Name" placeholder="" bind:value={editName} />
  <InputField label="Description" large bind:value={editDescription} />
</Modal>

<Modal
  bind:visible={inviteOpen}
  title="Invite Collaborator"
  buttons={[
    { label: "Close", onClick: () => (inviteOpen = false) },
    { label: "Send invite", onClick: sendInvite, disabled: inviteSending || !inviteEmail },
  ]}
>
  <InputField
    label="Email address"
    placeholder="name@example.com"
    bind:value={inviteEmail}
  />
  <SegmentedSelector
    fullWidth
    label="Role"
    bind:value={inviteRole}
    options={[
      ["editor", "Editor"],
      ["viewer", "Viewer"],
    ]}
  />
  {#if inviteMessage}
    <p>{inviteMessage}</p>
  {/if}

  {#if sentInvites.length}
    <p class="pending-heading"><strong>Pending invites</strong></p>
    <ul class="pending-list">
      {#each sentInvites as invite (invite.id)}
        <li>
          <span>{invite.email} &middot; {invite.role}</span>
          <button
            class="revoke"
            on:click={() => handleRevoke(invite)}
            disabled={revokingId === invite.id}
          >
            {revokingId === invite.id ? "Revoking…" : "Revoke"}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</Modal>

<Modal
  bind:visible={embedOpen}
  title="Public Embed"
  buttons={[{ label: "Close", onClick: () => (embedOpen = false) }]}
>
  <p>
    Turn this on to let anyone with the link view this project's weekly
    timeline and the most recent week's notes &mdash; no login required.
    Useful for embedding into a Google Site. Nothing else about the project
    is shared, and you can turn this off at any time.
  </p>
  {#if isAsyncProject(project)}
    <Checkbox
      label="Allow public viewing"
      checked={project.publicShare}
      disabled={embedSaving}
      on:change={(e) => setPublicShare((e.target as HTMLInputElement).checked)}
    />
    {#if project.publicShare}
      <InputField label="Embed URL" value={embedUrl} readonly />
      <button class="copy-url" on:click={copyEmbedUrl}>
        {embedCopied ? "Copied!" : "Copy link"}
      </button>
    {/if}

    <p class="snapshot-heading">
      Can't use a live embed? Download a one-time snapshot image instead
      &mdash; the same timeline shown on the Export screen, with this week's
      notes underneath. You can paste this directly into a Google Site as
      an image; it won't update automatically.
    </p>
    <button
      class="copy-url"
      on:click={downloadSnapshot}
      disabled={snapshotGenerating}
    >
      {snapshotGenerating ? "Generating…" : "Download snapshot (PNG)"}
    </button>
    {#if snapshotError}
      <p class="snapshot-error">{snapshotError}</p>
    {/if}
  {/if}
</Modal>

<Modal
  bind:visible={deleteProjectOpen}
  title="Delete Project"
  buttons={[
    {
      label: "Cancel",
      onClick: () => (deleteProjectOpen = false),
      disabled: !active,
    },
    { label: "Delete", onClick: remove, disabled: !active },
  ]}
>
  <p>
    The project
    <strong>{project.name}</strong>
    and all its data will be removed.
  </p>
  <p>You can’t undo this action.</p>
</Modal>

<Modal
  bind:visible={toggleProjectCompleteOpen}
  title="{project.active ? 'Archive' : 'Unarchive'} This Project?"
  buttons={[
    {
      label: "Cancel",
      onClick: () => (toggleProjectCompleteOpen = false),
    },
    { label: "OK", onClick: toggleProjectComplete },
  ]}
>
  {#if project.active}
    This project will be removed from your recent projects and you won't be able
    to add entries to this project anymore. You can stil find it under "All
    projects" on the home screen.
  {:else}
    This project will move back to your recent projects and you'll be able to
    add entries.
  {/if}
</Modal>

<style lang="scss">
  @use "src/styles/tokens" as *;

  .pending-heading {
    margin: 1rem 0 0.25rem 0;
  }
  .pending-list {
    list-style: none;
    margin: 0;
    padding: 0;
    li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.4rem 0;
    }
  }
  .revoke {
    flex-shrink: 0;
  }
  .copy-url {
    margin-top: -0.25rem;
  }
  .snapshot-heading {
    margin: 1rem 0 0.5rem 0;
  }
  .snapshot-error {
    color: $accent-danger-color;
    margin-top: 0.5rem;
  }
</style>