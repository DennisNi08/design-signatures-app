<!--
  Copyright (c) 2021, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts">
  import { pop, push, replace, router } from "svelte-spa-router";
  import {doc, setDoc, serverTimestamp} from "firebase/firestore";
  import {db} from "../data/firebase";
  import {getUid} from "../data/authState.svelte";
  import BackButton from "../components/BackButton.svelte";
  import BottomActionBar from "../components/BottomActionBar.svelte";
  import {
    BUILDER_MODAL_SUFFIX,
    BUILDER_SUFFIX,
  } from "../components/DesignModel/Builder.svelte";
  import BuilderFrame from "../components/DesignModel/BuilderFrame.svelte";
  import DesignModelChooser from "../components/DesignModel/Chooser.svelte";
  import InputField from "../components/InputField.svelte";
  import ContentFrame from "../components/layout/ContentFrame.svelte";
  import Header from "../components/type/Header.svelte";
  import { newRealtimeProject } from "../data/database";
  import { pushRecentProject } from "../data/recentProjects";
  import type { DesignModel } from "../data/schema";
  import { delay } from "../util/delay";

  let name = "";
  let description = "";

  let designModel: DesignModel;
  let isCreating = false;

  export let params: { wild: string };

  let canContinue = false;
  $: canContinue = name !== "" && designModel !== null && !isCreating;

  async function go() {
    isCreating = true;
    const proj = newRealtimeProject();
    proj.name = name;
    proj.description = description;
    proj.designModel = designModel;
    proj.created = new Date();
    proj.modified = new Date();
    proj.notes = [];
    proj.sessions = [];
    proj.active = true;
    proj.ownerUid = getUid() ?? "";
    await proj.save();

    const uid = getUid();
    if (uid) {
      await setDoc(doc(db, "projectMembers", `${uid}_${proj.id}`), {
        projectId: proj.id,
        uid,
        role: "owner",
        status: "active",
        joinedAt: serverTimestamp(),
      });
    }

    const id = proj.id;
    pushRecentProject(id);

    await pop();
    await delay(16);
    await replace(`/projects/${id}/`);
  }
</script>

<main class="device-frame page">
  {#if !(params.wild === BUILDER_SUFFIX || params.wild === BUILDER_MODAL_SUFFIX)}
    <ContentFrame>
      <BackButton href="/new/" />
      <Header>Create Project</Header>
      <InputField
        label="Project name"
        placeholder="My cool project"
        bind:value={name}
      />
      <InputField label="Description" large bind:value={description} />
      <DesignModelChooser
        bind:selectedDesignModel={designModel}
        createNew={() => push(router.location + BUILDER_SUFFIX)}
      />
    </ContentFrame>
    <BottomActionBar
      label="Create project"
      on:click={go}
      disabled={!canContinue}
    />
  {:else}
    <BuilderFrame
      bind:designModel
      showModal={params.wild === BUILDER_MODAL_SUFFIX}
    />
  {/if}
</main>

<style lang="scss">
  @use "src/styles/tokens" as *;
  .page {
    background-color: $background-color;
    min-height: 100%;
  }
</style>
