<!--
  Copyright (c) 2021, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts">
  import { getProjectOrFail } from "../data/database";
  import type { AsyncProject, RealtimeProject } from "../data/schema";
  import CardDotGrid from "./CardDotGrid.svelte";
  import CardTimeline from "./CardTimeline.svelte";
  import { isRealtimeProject, isAsyncProject } from "../types/utility";

  export let newProjectPlaceholder = false;
  export let loadingPlaceholder = false;
  export let id: string | null = null;

  let loading = true;
  let project: RealtimeProject | AsyncProject | null = null;

  if (newProjectPlaceholder) {
    loading = false;
  } else if (!loadingPlaceholder) {
    (async function load() {
      if (id) {
        project = (await getProjectOrFail(id))[1];
        loading = false;
      }
    })().catch(() => {
      project = null;
    });
  }
</script>

<div class="project-card" class:loading>
  {#if newProjectPlaceholder}
    <div class="card new">
      <svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 62 62"
        ><circle cx="31" cy="31" r="30.75" fill="none" stroke-width=".5" />
        <path
          d="M31.5312 30.125h13.5626v2.5625H31.5312v13.5h-2.5624v-13.5h-13.5V30.125h13.5V16.5625h2.5624V30.125z"
          stroke="none"
        /></svg
      >
    </div>
  {:else}
    <div class="card">
      {#if !loading && project}
        {#if isRealtimeProject(project) && project.sessions.length}
          <CardTimeline {project} />
        {:else if isAsyncProject(project)}
          <CardDotGrid {project} />
        {/if}
      {/if}
    </div>
  {/if}

  <div class="link" class:loading class:new={newProjectPlaceholder}>
    {#if !loading && !newProjectPlaceholder && project}
      <span>{project.name}</span>
    {:else if !loading}New project{/if}
  </div>
</div>

<style lang="scss">
  @use "src/styles/tokens" as *;
  @use "src/styles/type" as *;

  .card {
    width: $project-card-width;
    height: $project-card-height;
    background: $project-card-background-color;
    box-shadow: $project-card-shadow;
    border-radius: $project-card-border-radius;
    overflow: hidden;

    display: flex;
    justify-content: center;
    align-items: center;

    &.new {
      svg {
        fill: $project-card-new-plus-color;
        stroke: $project-card-new-plus-color;
        width: $project-card-new-plus-size;
        height: $project-card-new-plus-size;
      }
    }
  }
  .link {
    @include type-style($type-card-link);
    margin-top: $project-card-link-margin-top;
    width: $project-card-width;
    display: block;

    span {
      display: inline-block;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
      max-width: calc(#{$project-card-width} - #{$project-card-link-arrow-gap});
      vertical-align: bottom;
    }

    &.loading {
      width: $project-card-loading-ph-width;
      height: $project-card-loading-ph-height;
      background-color: $loading-placeholder-color;
    }
    &:not(.loading)::after {
      content: "›";
      display: inline-block;
      transform: translateX(0.5rem);
    }
  }
</style>
