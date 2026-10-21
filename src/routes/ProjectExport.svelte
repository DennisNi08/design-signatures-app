<!--
  Copyright (c) 2021-2023, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts">
  import loadingIcon from "@iconify-icons/ic/baseline-hourglass-empty";
  import notFoundIcon from "@iconify-icons/ic/baseline-search-off";
  import BackButton from "../components/BackButton.svelte";
  import BottomActionBar from "../components/BottomActionBar.svelte";
  import Checkbox from "../components/Checkbox.svelte";
  import ContentFrame from "../components/layout/ContentFrame.svelte";
  import HorizontalScrollArea from "../components/layout/HorizontalScrollArea.svelte";
  import Link from "../components/Link.svelte";
  import RichLabel from "../components/RichLabel.svelte";
  import SegmentedSelector from "../components/SegmentedSelector.svelte";
  import SelectField from "../components/SelectField.svelte";
  import SplashScreen from "../components/SplashScreen.svelte";
  import Header from "../components/type/Header.svelte";
  import { getProjectOrFail, invalidateProjectCache } from "../data/database";
  import type { AsyncProject, RealtimeProject } from "../data/schema";
  import type { ThenType } from "../types/utility";
  import dotTimeline from "../util/dotTimeline";
  import { download, downloadBlob } from "../util/download";
  import timeline from "../util/timeline";

  export let params: { id: string };

  // Bust the in-memory cache first so exports reflect any changes other
  // project members have saved since this tab last loaded the project.
  invalidateProjectCache(params.id);
  let projectPromise = getProjectOrFail(params.id);

  let project: RealtimeProject | AsyncProject;
  let projectData: ThenType<typeof projectPromise> | undefined;
  projectPromise.then((res) => {
    projectData = res;
    project = res[1];
  });

  let exportType: "image" | "data" = "image";
  let imageSize: number = 500;
  let imageScale: number = Math.round(window.devicePixelRatio) ?? 1;
  let showNotes = false;
  let showTime = true;

  let canvasElement: HTMLCanvasElement | undefined;

  async function doExport() {
    if (!project) await projectPromise;
    if (exportType === "data") {
      download(
        `${safeName(project.name)}.json`,
        "application/json",
        project.serialize(),
      );
    } else {
      if (canvasElement) {
        let blob = await getImage(canvasElement);
        if (!blob) return;
        downloadBlob(`${safeName(project.name)}.png`, blob);
      }
    }
  }

  function getImage(canvas: HTMLCanvasElement) {
    return new Promise<Blob | null>((res) => canvas.toBlob(res));
  }

  function safeName(name: string) {
    return name.trim().replace(/[\W\:\/\\]+/g, "-");
  }
</script>

{#await projectPromise}
  <SplashScreen icon={loadingIcon} label="Loading project…" delay={100} />
{:then projectInfo}
  <main class="device-frame page">
    <ContentFrame>
      <BackButton href="/" />
      <Header>Export {project.name}</Header>

      <SegmentedSelector
        bind:value={exportType}
        label="Type"
        fullWidth
        options={[
          ["image", "Visualization (PNG)"],
          ["data", "Project data (JSON)"],
        ]}
      />

      {#if exportType === "image"}
        {#if projectInfo[0] === "RealtimeProject"}
          <SelectField
            bind:value={imageSize}
            label="Width"
            fullWidth
            options={[
              [200, "Super short"],
              [350, "Short"],
              [500, "Normal"],
              [750, "Long"],
              [1000, "Super long"],
            ]}
          />

          <SegmentedSelector
            bind:value={imageScale}
            label="Resolution"
            fullWidth
            options={[
              [1, "1x"],
              [2, "2x"],
              [3, "3x"],
            ]}
          />

          <RichLabel label="Features" />
          <Checkbox bind:checked={showNotes} label="Show notes" />
          <Checkbox bind:checked={showTime} label="Show timestamps" />

          <RichLabel label="Preview" />

          <HorizontalScrollArea>
            <canvas
              bind:this={canvasElement}
              use:timeline={{
                project: projectInfo[1],
                dpi: imageScale,
                interactive: false,
                width: imageSize,
                showNotes,
                showTime,
              }}
            ></canvas>
          </HorizontalScrollArea>
        {:else}
          <SegmentedSelector
            bind:value={imageScale}
            label="Resolution"
            fullWidth
            options={[
              [1, "1x"],
              [2, "2x"],
              [3, "3x"],
            ]}
          />

          <RichLabel label="Features" />
          <Checkbox bind:checked={showTime} label="Show dates" />
          <Checkbox bind:checked={showNotes} label="Show notes" />
          <!-- <Checkbox checked={true} disabled label="Skip days without entries" /> -->

          <RichLabel label="Preview" />

          <HorizontalScrollArea>
            <canvas
              bind:this={canvasElement}
              use:dotTimeline={{
                project: projectInfo[1],
                dpi: imageScale,
                showDates: showTime,
                showNotes,
                // hideEmptyDays
              }}
            ></canvas>
          </HorizontalScrollArea>
        {/if}
      {:else if exportType === "data"}
        <p>
          <a href="https://data.design-awareness.com/" target="_blank"
            >Learn more about the Design Signatures data export format</a
          >
        </p>

        <RichLabel label="Preview" />

        <HorizontalScrollArea>
          <pre>
            {project.serialize(true)}
          </pre>
        </HorizontalScrollArea>
      {/if}
      <BottomActionBar label="Export" on:click={doExport} />
    </ContentFrame>
  </main>
{:catch}
  <SplashScreen icon={notFoundIcon} label="Project not found.">
    <Link href="/">Go home</Link>
    <Link href="/projects/">All projects</Link>
  </SplashScreen>
{/await}

<style lang="scss">
  @use "src/styles/tokens" as *;
  @use "src/styles/type" as *;

  pre {
    background: $alt-background-color;
    @include type-style($type-caption);
    padding: 0.75rem;
  }
</style>
