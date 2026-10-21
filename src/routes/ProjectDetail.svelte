<!--
  Copyright (c) 2021, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts">
  import loadingIcon from "@iconify-icons/ic/baseline-hourglass-empty";
  import notFoundIcon from "@iconify-icons/ic/baseline-search-off";
  import Link from "../components/Link.svelte";
  import SplashScreen from "../components/SplashScreen.svelte";
  import { getProjectOrFail, invalidateProjectCache } from "../data/database";
  import ProjectDetailAsync from "./ProjectDetailAsync.svelte";
  import ProjectDetailRealtime from "./ProjectDetailRealtime.svelte";

  export let params: { id: string };
  // Bust the in-memory cache first so a fresh visit reflects any changes
  // other project members have saved since this tab last loaded it.
  invalidateProjectCache(params.id);
  let promise = getProjectOrFail(params.id);
</script>

{#await promise}
  <SplashScreen icon={loadingIcon} label="Loading project…" delay={100} />
{:then projectProperties}
  {#if projectProperties[0] === "AsyncProject"}
    <ProjectDetailAsync project={projectProperties[1]} />
  {:else}
    <ProjectDetailRealtime project={projectProperties[1]} />
  {/if}
{:catch}
  <SplashScreen icon={notFoundIcon} label="Project not found.">
    <Link href="/">Go home</Link>
    <Link href="/projects/">All projects</Link>
  </SplashScreen>
{/await}
