
<script lang="ts">
  import { onMount} from "svelte";
  import PageHeader from "../components/PageHeader.svelte";

  let buttonContainer: HTMLDivElement;

  interface CredentialReponse {
    credential: string;
    select_by?: string;
  }

  function handleCredentialResponse(response:any){
    console.log("Encoded JWT ID token: "+response.credential)
  }

  onMount(() => {
    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
    });

    window.google.accounts.id.renderButton(buttonContainer, {
      type: "standard",
      size: "large",
      theme: "outline",
      text: "sign_in_with",
      shape: "rectangular",
      logo_alignment: "left",
    });
  });
</script>

<main class="login">
  <PageHeader />
  <div bind:this={buttonContainer}></div>
</main>
