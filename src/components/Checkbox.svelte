<!--
  Copyright (c) 2021, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts">
  import { randomID } from "../util/id";

  type GroupT = $$Generic<string | number>;

  export let checked: boolean = false;
  export let disabled: boolean = false;
  export let label: string;
  export let helptext: string = "";

  let id = randomID();
</script>

<div class="wrapper">
  <input type="checkbox" bind:checked {id} {disabled} on:change />
  <label for={id}>
    <p>{label}</p>
    {#if helptext}
      <span>{helptext}</span>
    {/if}
  </label>
</div>

<style lang="scss">
  @use "sass:map";
  @use "sass:math";
  @use "src/styles/tokens" as *;
  @use "src/styles/type" as *;

  .wrapper {
    display: flex;
    gap: 0.5rem;
  }
  input {
    $checkbox-size: 1.25rem;
    border: $input-border-size solid $input-border-color;
    border-radius: $input-border-radius;
    background-color: $input-background-color;
    appearance: none;
    -webkit-appearance: none;
    height: $checkbox-size;
    width: $checkbox-size;
    flex-shrink: 0;
    box-sizing: border-box;
    $vertical-pad: math.div(
      rem(map.get($type-input-label, height)) - $checkbox-size,
      2
    );
    margin: $vertical-pad 0;

    &:checked {
      border-color: $input-selected-color;
      background-color: $input-selected-color;
    }

    &:disabled {
      opacity: 0.5;
    }
  }
  label {
    display: flex;
    flex-grow: 1;
    flex-direction: column;
  }
  p {
    @include type-style($type-input-label);
    margin: 0;
  }
  span {
    @include type-style($type-input);
    color: $text-ghost-color;
  }
</style>
