<!--
  Copyright (c) 2021, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts">
  import loadingIcon from "@iconify-icons/ic/baseline-hourglass-empty";
  import BackButton from "../components/BackButton.svelte";
  import ContentFrame from "../components/layout/ContentFrame.svelte";
  import ProjectCard from "../components/ProjectCard.svelte";
  import SplashScreen from "../components/SplashScreen.svelte";
  import Header from "../components/type/Header.svelte";
  import {
    getUserProjectsIds, getProjectOrFail
  } from "../data/database";
  import { getUid } from "../data/authState.svelte";
  import { sortBy } from "../util/sort";

  let projectPromise = (async function () {
    const uid = getUid();
    if (!uid) { return []; }
    const ids = await getUserProjectsIds(uid);
    const results = await Promise.all(ids.map(id => getProjectOrFail(id).catch(() => null)));
    const unsortedProjects = results.filter((r) => r !== null).map(([,project]) => project);

    return sortBy("modified", unsortedProjects,false);
  })();
</script>

{#await projectPromise}
  <SplashScreen icon={loadingIcon} label="Loading projects…" delay={100} />
{:then projects}
  <main class="device-frame page">
    <ContentFrame>
      <BackButton href="/" />
      <Header>All Projects</Header>
      <ul>
        {#each projects as { id }}
          <li>
            <a href={"#/projects/" + id}>
              <ProjectCard {id} />
            </a>
          </li>
        {/each}
      </ul>
    </ContentFrame>
  </main>
{/await}

<style lang="scss">
  @use "src/styles/tokens" as *;
  .page {
    background-color: $background-color;
    min-height: 100%;
  }
  ul {
    list-style-type: none;
    margin: 4rem 0 0 0;
    padding: 0;
    display: flex;
    width: 100%;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: flex-start;
  }
  li {
    margin: 1rem;
    a {
      color: inherit;
      text-decoration: none;
      display: block;
      // TODO: This needs to come from the same place as wherever we get them
      // from in components/ProjectCard.
      border-radius: 3px;
      height: 12rem;
      margin-bottom: 1.5rem;
    }
  }
</style>
