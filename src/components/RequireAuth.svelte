<script lang="ts">
 import { push } from "svelte-spa-router";
  import {getUser, isLoading} from "../data/authState.svelte";

  interface Props {
    children?: import("svelte").Snippet;
  }
  let { children }: Props = $props();

  $effect(() => {
    if (!getUser() && !isLoading()) {
      push("/login");
    }
  });
  </script>

  {#if isLoading()}
    <p>Loading...</p>
  {:else if getUser()}
    {@render children?.()}
  {/if}
