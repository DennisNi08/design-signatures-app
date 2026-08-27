<!--
  Copyright (c) 2021, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts">
  import { push } from "svelte-spa-router";
  import reflectIcon from "../assets/reflectIcon";
  import Button from "../components/Button.svelte";
  import ContentFrame from "../components/layout/ContentFrame.svelte";
  import HorizontalScrollArea from "../components/layout/HorizontalScrollArea.svelte";
  import Link, { goDown } from "../components/Link.svelte";
  import PageHeader from "../components/PageHeader.svelte";
  import ProjectCard from "../components/ProjectCard.svelte";
  import Header from "../components/type/Header.svelte";
  import { canInstall, isInstalled, showInstallPrompt } from "../util/pwa";
  import { getPendingInviteCount } from "../data/inviteNotifications.svelte";
  import { getRecentUserProjects } from "../data/database"
  import { getUid } from "../data/authState.svelte"

  async function install() {
    if ($canInstall && (await showInstallPrompt())) {
      location.reload();
    } else {
      goDown("/install");
    }
  }
</script>

<main class="device-frame home">
  <PageHeader />

  <ContentFrame>
    {#if !$isInstalled}
      <Header>Install app</Header>
      <Button on:click={install}>Install</Button>
    {/if}

    <Header>Recent Projects</Header>

    <HorizontalScrollArea>
      <ul>
        <li>
          <a href="#/new/">
            <ProjectCard newProjectPlaceholder />
          </a>
        </li>
        {#await (getUid() ? getRecentUserProjects(getUid()!) : Promise.resolve([]))}
          <li>
            <ProjectCard loadingPlaceholder />
          </li>
        {:then projects}
          {#each projects as id}
            <li>
              <a href={"#/projects/" + id}>
                <ProjectCard {id} />
              </a>
            </li>
          {/each}
        {/await}
      </ul>
    </HorizontalScrollArea>

    <div class="button-holder">
      <Button on:click={async () => await push("/projects/")}>
        All projects
      </Button>

      <div class="invite-button-wrap">
        <Button on:click={async () => await push("/invites/")}>
        Invitations
        </Button>
        {#if getPendingInviteCount() >0}
        <span class = "badge">{getPendingInviteCount()}</span>
        {/if}
      </div>

      <Button on:click={async () => await push("/reflect/")} icon={reflectIcon}>
        Reflect
      </Button>
    </div>

    {#if location.hostname.indexOf("design") === -1}
      <Header>Developer</Header>
      <p>
        <Link href="/dev/">Developer tools and configuration ›</Link>
      </p>
    {/if}

    <Header>About Design Awareness</Header>
    <p>
      <Link href="/about/tutorials">Tutorials ›</Link>
    </p>
    <p>
      <Link href="/about/the-point">What's the point? ›</Link>
    </p>
    <p>
      <Link href="/about/research">Explore design process research ›</Link>
    </p>
    <p>
      <Link href="/about/models">Design models ›</Link>
    </p>
    <p>
      <Link href="/about/project">About this project ›</Link>
    </p>
  </ContentFrame>
</main>

<style lang="scss">
  @use "src/styles/tokens" as *;
  .home {
    background-color: $background-color;
    min-height: 100%;
  }

  ul {
    list-style-type: none;
    margin: 0;
    padding: 0;
    display: flex;
  }
  li {
    margin-right: 1rem;
    &:last-child {
      margin-right: 0;
    }
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
  .button-holder {
    display: flex;
    justify-content: space-between;
  }
  .invite-button-wrap {
    position: relative;
    display: inline-block;
  }
  .badge {
    position: absolute;
    top: -0.4rem;
    right: -0.4rem;
    min-width: 1.2rem;
    height: 1.2rem;
    padding: 0 0.3rem;
    border-radius: 999px;
    background-color: $accent-danger-color;
    color: white;
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 1.2rem;
    text-align: center;
    pointer-events: none;
  }
</style>
