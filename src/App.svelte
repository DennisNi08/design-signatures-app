<!--
  Copyright (c) 2021, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts">
  import Router, { type RouteDefinition, push } from "svelte-spa-router";
  import { createPresets } from "./data/designModelPresets";
  import { awaitObjectUpgradeIfNeeded } from "./data/upgradeObjects";
  import AboutProject from "./routes/about/AboutProject.svelte";
  import AllProjects from "./routes/AllProjects.svelte";
  import ComponentLibrary from "./routes/dev/ComponentLibrary.svelte";
  import DBEditor from "./routes/dev/DBEditor.svelte";
  import DevTools from "./routes/dev/DevTools.svelte";
  import Home from "./routes/Home.svelte";
  import Import from "./routes/Import.svelte";
  import Models from "./routes/about/Models.svelte";
  import NewAsyncProject from "./routes/NewAsyncProject.svelte";
  import NewProjectType from "./routes/NewProjectType.svelte";
  import NewRealtimeProject from "./routes/NewRealtimeProject.svelte";
  import NotFound from "./routes/NotFound.svelte";
  import Project from "./routes/ProjectDetail.svelte";
  import ProjectExport from "./routes/ProjectExport.svelte";
  import ProjectTracking from "./routes/ProjectTracking.svelte";
  import RedirectAddPath from "./routes/RedirectAddPath.svelte";
  import ReflectionQuestions from "./routes/ReflectionQuestions.svelte";
  import Research from "./routes/about/Research.svelte";
  import Settings from "./routes/Settings.svelte";
  import ThePoint from "./routes/about/ThePoint.svelte";
  import Tutorials from "./routes/about/Tutorials.svelte";
  import Update from "./routes/Update.svelte";
  import Install from "./routes/Install.svelte";
  import Onboarding from "./routes/Onboarding.svelte";
  import Login from "./routes/Login.svelte"
  import { isLoading, getUser } from "./data/authState.svelte";
  import { onMount } from "svelte";

  awaitObjectUpgradeIfNeeded();
  createPresets(); // noop, but keeps the linter happy :)

  let currentHash = $state(window.location.hash);

  onMount(() => {
    const updateHash = () => {
      currentHash = window.location.hash;
    };
    window.addEventListener("hashchange", updateHash);
    return () => {
      window.removeEventListener("hashchange", updateHash);
    };
  });

  const routes: RouteDefinition = {
    "/": Home, // Home
    "/login": Login, //Login Page,

    "/new/realtime/*": NewRealtimeProject,
    "/new/realtime": RedirectAddPath,
    "/new/async/*": NewAsyncProject,
    "/new/async": RedirectAddPath,
    "/new/": NewProjectType,
    "/new": RedirectAddPath,

    "/projects/": AllProjects, // Projects
    "/projects": RedirectAddPath, // Projects
    "/projects/:id/": Project, // Project detail
    "/projects/:id": RedirectAddPath,
    "/projects/:id/export": ProjectExport,
    "/projects/:id/track/*": ProjectTracking, // Project tracking
    "/projects/:id/track": RedirectAddPath,

    "/reflect/": ReflectionQuestions, //Reflection Qs
    "/reflect": RedirectAddPath,

    "/import/": Import,
    "/import": RedirectAddPath,

    "/about/": NotFound,
    "/about/tutorials": Tutorials, // Tutorials
    "/about/the-point": ThePoint, // Whats the point?
    "/about/research": Research, // Explore design process research
    "/about/models": Models, // Design Models
    "/about/project": AboutProject, //About this Project (+ team bio)

    "/settings/": Settings, // Settings
    "/settings": RedirectAddPath, // Settings

    "/install/": Install, // Install
    "/install": RedirectAddPath,

    "/onboarding/": Onboarding,
    "/onboarding": RedirectAddPath,

    "/update/:n": Update,

    "/dev/": DevTools,
    "/dev": RedirectAddPath,
    "/dev/dbeditor/": DBEditor, // Database editor
    "/dev/component-library/*": ComponentLibrary, // Component library
    "/dev/component-library": RedirectAddPath,

    "*": NotFound, // Not found
  };

  $effect(() => {
    if (isLoading())return;

    const onLoginPage = currentHash.startsWith("#/login");;

    if (!getUser() && !onLoginPage) {
      push("/login");
    } else if (getUser() && onLoginPage) {
      push("/");
    }
  });
</script>
{#if isLoading()}
  <p>Loading...</p>
  {:else}
  <Router {routes} />
{/if}

<style lang="scss">
  @use "styles/colors" as *;
  @use "styles/tokens" as *;
  @use "styles/type" as *;

  :global(:root) {
    @include color-theme-light;
    @media (prefers-color-scheme: dark) {
      @include color-theme-dark;
    }
  }

  :global(body) {
    @include type-style($type-body);
    background-color: $background-color;
    color: $text-primary-color;
  }

  :global(:focus) {
    outline: none;
    box-shadow: 0 0 0 2px rgb(34, 154, 235);
  }

  @supports #{"selector(:focus-visible)"} {
    :global(:focus) {
      box-shadow: none;
    }
    :global(:focus-visible) {
      outline: none;
      box-shadow: 0 0 0 2px rgb(34, 154, 235);
    }
  }

  :global(a) {
    color: $text-actionable-color;
    text-decoration: none;
  }
</style>
