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
  import unarchiveIcon from "@iconify-icons/ic/baseline-unarchive";
  import { pop, push } from "svelte-spa-router";
  import {
    pushRecentProject,
    removeRecentProject,
  } from "../data/recentProjects";
  import type { AsyncProject, RealtimeProject } from "../data/schema";
  import { hasOwnProperty } from "../types/utility";
  import { createInvite, getSentInvites, revokeInvite, type ProjectInvite } from "../data/invites";
  import InputField from "./InputField.svelte";
  import Modal from "./Modal.svelte";
  import SegmentedSelector from "./SegmentedSelector.svelte";
  import type { PopupMenuDescriptor } from "./PopupMenu.svelte";
  import PopupMenu from "./PopupMenu.svelte";

  export let project: AsyncProject | RealtimeProject;

  let editProjectOpen = false;
  let toggleProjectCompleteOpen = false;
  let deleteProjectOpen = false;
  let inviteOpen = false;

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
  let active = true;
  async function remove() {
    active = false;
    const toRemove = [];
    toRemove.push(removeRecentProject(project.id));
    project.notes.forEach((note) => toRemove.push(note.remove()));
    if (hasOwnProperty(project, "entries")) {
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
</style>