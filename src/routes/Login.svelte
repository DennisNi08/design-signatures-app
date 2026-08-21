<script lang="ts">
  import PageHeader from "../components/PageHeader.svelte";
  import { auth } from "../data/firebase";
  import { push } from "svelte-spa-router";
  import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

  const provider = new GoogleAuthProvider();
  let error: string | undefined = $state();
  let signingIn = $state(false);

  async function login() {
    error = undefined;
    signingIn = true;
    try {
      await signInWithPopup(auth, provider);
      push("/");
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      console.error("Popup sign-in failed:", err);
    } finally {
      signingIn = false;
    }
  }
</script>

<main class="login">
  <PageHeader />
  <button onclick={login} disabled={signingIn}>
    {signingIn ? "Signing in…" : "Sign in with Google"}
  </button>
  {#if error}
    <p class="error">{error}</p>
  {/if}
</main>

<style lang="scss">
  .error {
    color: red;
  }
</style>