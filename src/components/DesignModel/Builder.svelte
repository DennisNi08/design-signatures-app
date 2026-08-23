<!--
  Copyright (c) 2021, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts" context="module">
  export const BUILDER_SUFFIX = "model";
  export const BUILDER_MODAL_SUFFIX = "model!";
</script>

<script lang="ts">
  import add from "@iconify-icons/ic/baseline-add";
  import type { DesignModel } from "../../data/schema";
  import BottomActionBar from "../BottomActionBar.svelte";
  import InputField from "../InputField.svelte";
  import Header from "../type/Header.svelte";
  import ActivityEditor from "./ActivityEditor.svelte";
  import { dndzone, SOURCES, TRIGGERS } from "svelte-dnd-action";
  import Button from "../Button.svelte";
  import colorPresets from "../../data/colorPresets";
  import { newDesignModel } from "../../data/database";
  import { pop, push, router } from "svelte-spa-router";
  import { getUid } from "../../data/authState.svelte";

  export let designModel: DesignModel;
  export let showModal: boolean;
  let modalId = -1;

  function openModal(i: number) {
    modalId = i;
    if (router.location.endsWith(BUILDER_SUFFIX)) {
      push(router.location.replace(BUILDER_SUFFIX, BUILDER_MODAL_SUFFIX));
    }
  }
  function closeModal() {
    if (router.location.endsWith(BUILDER_MODAL_SUFFIX)) pop();
  }

  type ActivityWithID = {
    name: string;
    code: string;
    description: string;
    color: readonly [string, string];
    id: number;
  };

  const nextId = (function () {
    let lastId = 0;
    return () => lastId++;
  })();

  export let startingPoint: DesignModel;
  let name = startingPoint.name;
  let activities = startingPoint.activities.map<ActivityWithID>((activity) => ({
    ...activity,
    id: nextId(),
  }));

  function addItem() {
    const id = nextId();
    activities = [
      ...activities,
      {
        name: "",
        code: "",
        description: "",
        color: colorPresets[id % colorPresets.length],
        id,
      },
    ];
  }

  while (activities.length < 2) addItem();

  function remove(i: number) {
    activities = activities.filter((_, _i) => _i !== i);
  }

  let ok: boolean;
  $: ok =
    name !== "" &&
    activities.length >= 2 &&
    activities.every((activity) => activity.name && activity.code);

  let saving = false;
  async function build() {
    let as = newDesignModel();
    as.name = name;
    as.description = null;
    as.activities = activities.map(({ code, color, description, name }) => ({
      code: code.toUpperCase(),
      color,
      description,
      name,
    }));
    as.wellKnown = false;
    as.ownerUid = getUid() ?? "";
    saving = true;
    await as.save();
    designModel = as;
    await pop();
  }

  let dragDisabled = true;
  function handleDragConsider(e: {
    detail: { items: any; info: { source: any; trigger: any } };
  }) {
    const {
      items: newItems,
      info: { source, trigger },
    } = e.detail;
    activities = newItems;
    if (source === SOURCES.KEYBOARD && trigger === TRIGGERS.DRAG_STOPPED) {
      dragDisabled = true;
    }
  }
  function handleDragFinalize(e: {
    detail: { items: any; info: { source: any } };
  }) {
    const {
      items: newItems,
      info: { source },
    } = e.detail;
    activities = newItems;
    // Ensure dragging is stopped on drag finish via pointer (mouse, touch)
    if (source === SOURCES.POINTER) {
      dragDisabled = true;
    }
  }
</script>

<Header>Create a Design Model</Header>
{#if !saving}
  <InputField
    label="Title"
    helptext="This will name the model you create below and will allow you to identify and use it on other projects."
    bind:value={name}
  />
  <div class="label">Activities</div>
  <ul
    use:dndzone={{ items: activities, dragDisabled, dropTargetStyle: {} }}
    on:consider={handleDragConsider}
    on:finalize={handleDragFinalize}
  >
    {#each activities as activity, i (activity.id)}
      <li>
        <ActivityEditor
          bind:activity
          bind:dragDisabled
          isModalOpen={showModal && modalId === i}
          openModal={() => openModal(i)}
          {closeModal}
          remove={() => remove(i)}
        />
      </li>
    {/each}
  </ul>

  {#if activities.length < 10}
    <div class="add-button">
      <Button small on:click={addItem} icon={add}>Add activity</Button>
    </div>
  {/if}
{:else}
  <p>Saving…</p>
{/if}

<BottomActionBar label="Save and use" disabled={!ok} on:click={build} />

<style lang="scss">
  @use "sass:math";
  @use "src/styles/tokens" as *;
  @use "src/styles/type" as *;
  .label {
    @include type-style($type-input-label);
    margin: $block-vertical-spacing 0 $input-spacing-inner 0;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style-type: none;
  }
  li {
    margin: 0;
    padding: math.div($input-spacing-inner, 2);
    background-color: $background-color;
    border-radius: 0.01px;
    &:focus {
      // z-index: 20;
      position: relative;
    }
  }
  .add-button {
    margin: $input-spacing-inner 0;
  }
</style>
