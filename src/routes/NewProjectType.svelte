<!--
  Copyright (c) 2021, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts">
  import { push } from "svelte-spa-router";
  import BackButton from "../components/BackButton.svelte";
  import BottomActionBar from "../components/BottomActionBar.svelte";
  import ContentFrame from "../components/layout/ContentFrame.svelte";
  import Link from "../components/Link.svelte";
  import SegmentedComponentSelector from "../components/SegmentedComponentSelector.svelte";
  import TrackingModeOption from "../components/TrackingModeOption.svelte";
  import Header from "../components/type/Header.svelte";

  let option: "realtime" | "async" | null = "async";

  function go() {
    push(`/new/${option}/`);
  }
</script>

<main class="device-frame page">
  <ContentFrame>
    <BackButton href="/" />
    <Header>Choose a Tracking Mode</Header>
    <SegmentedComponentSelector
      component={TrackingModeOption}
      direction="vertical"
      options={[
        ["async", { type: "async" }],
      ]}
      bind:value={option}
    />
    <p>
      <Link href="/import/" horizontal>Import a project from a file</Link>
    </p>
    <BottomActionBar label="Next" disabled={!option} on:click={go} />
  </ContentFrame>
</main>

<style lang="scss">
  @use "src/styles/tokens" as *;
  @use "src/styles/type" as *;
  .page {
    background-color: $background-color;
    min-height: 100%;
  }

  p {
    text-align: center;
    @include type-style($type-detail);
  }
</style>
