<!--
  Copyright (c) 2021, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts">
  import BackButton from "../../components/BackButton.svelte";
  import Checkbox from "../../components/Checkbox.svelte";
  import ContentFrame from "../../components/layout/ContentFrame.svelte";
  import Link from "../../components/Link.svelte";
  import Header from "../../components/type/Header.svelte";
  import CONFIG from "../../data/config";
  import {
    deleteDB,
    getAllDesignModelIds,
    getDesignModel,
    getUserProjectsIds,
    getProjectOrFail,
    removeProjectMemberships,
  } from "../../data/database";
  import { getUid } from "../../data/authState.svelte";
  import { isAsyncProject, isRealtimeProject } from "../../types/utility";
  import { colorScheme } from "../../util/colorScheme";
  import { canInstall, isInstalled } from "../../util/pwa";

  let reloadSuppressed = false;
  let alwaysShowOnboarding = false;
  let showCanvasTimelineOnProjectPage = false;
  (async function () {
    reloadSuppressed = await CONFIG.getDevSuppressBeforeUnload();
    alwaysShowOnboarding = await CONFIG.getDevAlwaysShowOnboarding();
    showCanvasTimelineOnProjectPage =
      await CONFIG.getDevShowCanvasTimelineOnProjectPage();
  })();

  // Note: this only clears data belonging to the currently signed-in user
  // (their own projects, memberships, and non-wellKnown design models).
  async function deleteAll() {
    const uid = getUid();
    if (!uid) return;

    if (
      confirm(
        "Are you absolutely sure? All your projects and design models will be deleted."
      )
    ) {
      const [modelIds, projectIds] = await Promise.all([
        getAllDesignModelIds(uid),
        getUserProjectsIds(uid),
      ]);

      const projects = (
        await Promise.all(
          projectIds.map((id) => getProjectOrFail(id).catch(() => null))
        )
      ).filter((r) => r !== null);

      await Promise.all([
        CONFIG.setRecentProjects([]),
        ...projects.map(async ([, project]) => {
          await removeProjectMemberships(project.id);
          if (project.notes) {
            await Promise.all(project.notes.map((note) => note.remove()));
          }
          if (isAsyncProject(project)) {
            await Promise.all(project.entries.map((entry) => entry.remove()));
          } else if (isRealtimeProject(project)) {
            await Promise.all(
              project.sessions.map((session) => session.remove())
            );
          }
          await project.remove();
        }),
        ...modelIds.map(async (id) => {
          const model = await getDesignModel(id);
          if (model && !model.wellKnown && model.ownerUid === uid) {
            await model.remove();
          }
        }),
      ]);

      alert("Your data has been cleared.");
      location.reload();
    }
  }

  // Wipes only the local IndexedDB store used for on-device settings
  // (the "_Config" store). Does not touch any Firestore data, since
  // project/model/entry data now lives in Firestore, not locally.
  async function deleteDb() {
    if (
      confirm(
        "Are you absolutely sure? Your local device settings will be reset. This does not affect any of your projects or design models, which are stored in the cloud."
      )
    ) {
      try {
        await deleteDB();
        alert("Local settings reset successfully.");
      } catch (e) {
        alert("An error occurred while resetting local settings.");
      }
      location.reload();
    }
  }
</script>

<ContentFrame>
  <BackButton href="/" />
  <Header>Developer Tools</Header>
  <p>
    <Link href="/dev/DBEditor">Database inspector</Link>
  </p>
  <p>
    <Link href="/dev/component-library/">Component library</Link>
  </p>

  <Header>Developer Configuration</Header>
  <p>
    Prevent reload/close while tracking:
    <button
      on:click={() => {
        reloadSuppressed = !reloadSuppressed;
        CONFIG.setDevSuppressBeforeUnload(reloadSuppressed);
      }}>{reloadSuppressed ? "suppressed" : "normal"}</button
    >
  </p>

  <p>
    Show canvas timeline on async project page:
    <button
      on:click={() => {
        showCanvasTimelineOnProjectPage = !showCanvasTimelineOnProjectPage;
        CONFIG.setDevShowCanvasTimelineOnProjectPage(
          showCanvasTimelineOnProjectPage
        );
      }}>{showCanvasTimelineOnProjectPage ? "shown" : "hidden"}</button
    >
  </p>

  <p>
    Show onboarding on launch:
    <button
      on:click={() => {
        alwaysShowOnboarding = !alwaysShowOnboarding;
        CONFIG.setDevAlwaysShowOnboarding(alwaysShowOnboarding);
      }}>{alwaysShowOnboarding ? "always" : "normal"}</button
    >
  </p>

  <Header>Device Properties</Header>
  <p>Color scheme: {$colorScheme}</p>
  <p>PWA status: {$isInstalled ? "installed" : "not installed"}</p>
  <p>Has installation prompt: {$canInstall}</p>

  <Header>Danger Zone</Header>
  <p>
    Remove all of your projects and design models:
    <button on:click={deleteAll}>purge</button>
  </p>
  <p>
    Reset local device settings:
    <button on:click={deleteDb}>delete</button>
  </p>
</ContentFrame>