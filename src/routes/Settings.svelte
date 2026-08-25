<!--
  Copyright (c) 2021, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts">
  import { replace } from "svelte-spa-router";
  import { signOut } from "firebase/auth";
  import {auth} from "../data/firebase";
  import {getUser} from "../data/authState.svelte";
  import BackButton from "../components/BackButton.svelte";
  import Button from "../components/Button.svelte";
  import ButtonGroup from "../components/ButtonGroup.svelte";
  import Checkbox from "../components/Checkbox.svelte";
  import InvisibleButton from "../components/InvisibleButton.svelte";
  import ContentFrame from "../components/layout/ContentFrame.svelte";
  import Link from "../components/Link.svelte";
  import Header from "../components/type/Header.svelte";
  import SectionHeader from "../components/type/SectionHeader.svelte";
  import {
    BUILD_ENV,
    BUILD_TIME,
    FEEDBACK_LINK,
    GIT_HEAD,
    GIT_REPO,
    PULL_REQUEST,
    VERSION,
  } from "../data/buildData";
  import type { DesignModel } from "../data/schema";
  import { openOnboarding } from "../util/onboard";
  import { pinchToZoomEnabled, textScalingFactor } from "../util/scaling";
  import {
  getAllWellKnownDesignModelIds,
  getAllDesignModelIds,
  getDesignModel,
  getUserProjectsIds,
  getProjectOrFail,
} from "../data/database";
  import { getUid } from "../data/authState.svelte";

  async function resetWellKnownModels() {
  if (confirm("Are you sure? Built-in design models will be recreated.")) {
    const ids = await getAllWellKnownDesignModelIds();
    await Promise.all(
      ids.map(async (id) => {
        const model = await getDesignModel(id);
        if (model) await model.remove();
      })
    );
    alert("Reset complete.");
    location.reload();
  }
}

 async function deleteUnusedModels() {
  const uid = getUid();
  if (!uid) return;

  const modelIds = await getAllDesignModelIds(uid);
  const eligibleModels = new Set<DesignModel>(
    await Promise.all(modelIds.map((id) => getDesignModel(id)))
  );

  const projectIds = await getUserProjectsIds(uid);
  const projects = (
    await Promise.all(projectIds.map((id) => getProjectOrFail(id).catch(() => null)))
  ).filter((r) => r !== null);

  projects.forEach(([, project]) => eligibleModels.delete(project.designModel));

  const modelsToRemove = Array.from(eligibleModels.values()).filter((m) => !m.wellKnown);

  if (!modelsToRemove.length) {
    alert("No unused design models to delete.");
    return;
  }

  if (
    confirm(
      "The following unused design models will be deleted:\n" +
        modelsToRemove.map((set) => " - " + set.name).join("\n")
    )
  ) {
    await Promise.all(modelsToRemove.map((set) => set.remove()));
    alert("Done.");
    location.reload();
  }
}

  async function update() {
    if (!navigator.onLine) {
      alert(
        "Your device doesn't seem to be online.\nConnect to a network and try again."
      );
    } else {
      await replace("/update/3");
    }
  }

  async function handleSignOut() {
    await signOut(auth);
  }

  let tapCount = 0;
</script>

<main class="device-frame page">
  <ContentFrame>
    <BackButton href="/" />
    <Header>Settings</Header>

    <SectionHeader>Account</SectionHeader>
    <p>
      {#if getUser()}
        Signed in as <strong>{getUser()?.email}</strong>
      {/if}
    </p>
    <p>
      <Button small on:click={handleSignOut}>Sign out</Button>
    </p>

    {#if FEEDBACK_LINK}
      <SectionHeader>Feedback</SectionHeader>
      <a href={FEEDBACK_LINK} target="_blank">Send feedback about this app</a>
      {#if PULL_REQUEST && BUILD_ENV === "preview"}
        <p class="small">
          Note: this is a deploy preview. Consider leaving feedback on the pull
          request instead using the link below.
        </p>
      {/if}
    {/if}

    <SectionHeader>Import</SectionHeader>
    <p>
      <Button small on:click={() => replace("/import/")}>
        Import a project
      </Button>
    </p>

    <SectionHeader>Design models</SectionHeader>
    <p>
      <Button small on:click={deleteUnusedModels}>
        Remove unused design models
      </Button>
    </p>
    <p>
      <Button small on:click={resetWellKnownModels}>
        Reset built-in design models
      </Button>
    </p>

    <SectionHeader>Accessibility</SectionHeader>
    <p>
      <Checkbox
        bind:checked={$pinchToZoomEnabled}
        label="Pinch to zoom"
        helptext="Depending on your device and browser settings, this option might be ignored. You may need to restart the app for changes to take effect."
      />
    </p>

    <div>
      <p>
        Font scaling: {$textScalingFactor === 0
          ? "default"
          : $textScalingFactor > 0
          ? `+${$textScalingFactor}`
          : $textScalingFactor}
      </p>
      <ButtonGroup fill>
        <Button
          inlabel
          disabled={$textScalingFactor === -5}
          on:click={() => $textScalingFactor--}
        >
          Smaller
        </Button>
        <Button inlabel on:click={() => ($textScalingFactor = 0)}
          >Default</Button
        >
        <Button
          inlabel
          disabled={$textScalingFactor === 5}
          on:click={() => $textScalingFactor++}
        >
          Larger
        </Button>
      </ButtonGroup>
    </div>

    <SectionHeader>Onboarding</SectionHeader>
    <p>
      <Button small on:click={openOnboarding}>Replay onboarding</Button>
    </p>

    {#if BUILD_ENV === "dev" || tapCount > 4}
      <SectionHeader>Developer</SectionHeader>
      <p>
        <Link href="/dev/">Developer tools</Link>
      </p>
    {/if}

    <SectionHeader>About app</SectionHeader>
    <p class="small">
      <strong>Version:</strong>
      <InvisibleButton on:click={() => tapCount++}>{VERSION}</InvisibleButton>
      <br /><strong>Built:</strong>
      {new Date(BUILD_TIME).toLocaleString()}
      <br /><strong>Environment:</strong>
      {{ dev: "Development", preview: "Deploy Preview", prod: "Production" }[
        BUILD_ENV
      ]}
      {#if BUILD_ENV !== "prod"}
        {#if GIT_HEAD}
          <br /><strong>Branch:</strong>
          {GIT_HEAD}
        {/if}
        {#if PULL_REQUEST}
          <br /><strong>Pull request:</strong>
          #{PULL_REQUEST}
          <br />
          <a href="{GIT_REPO}/pull/{PULL_REQUEST}" target="_blank">
            Leave feedback on this preview version
          </a>
        {/if}
      {/if}
    </p>
    <p>
      <Button small on:click={update}>Force update and reload</Button>
    </p>
  </ContentFrame>
</main>

<style lang="scss">
  @use "src/styles/tokens" as *;
  .page {
    background-color: $background-color;
    min-height: 100%;
  }
  .small {
    font-size: 0.8em;
    :global(button) {
      display: inline-block;
      width: auto;
    }
  }
</style>
