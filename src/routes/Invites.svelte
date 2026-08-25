<script lang="ts">
  import BackButton from "../components/BackButton.svelte";
  import ContentFrame from "../components/layout/ContentFrame.svelte";
  import Header from "../components/type/Header.svelte";
  import Button from "../components/Button.svelte";
  import { getMyPendingInvites, acceptInvite, declineInvite, type ProjectInvite } from "../data/invites";

  let invitesPromise = getMyPendingInvites();
  let busyId: string | null = null;

  async function handleAccept(invite: ProjectInvite) {
    busyId = invite.id;
    await acceptInvite(invite);
    invitesPromise = getMyPendingInvites();
    busyId = null;
  }

  async function handleDecline(invite: ProjectInvite) {
    busyId = invite.id;
    await declineInvite(invite);
    invitesPromise = getMyPendingInvites();
    busyId = null;
  }
</script>

<main class="device-frame page">
  <ContentFrame>
    <BackButton href="/" />
    <Header>Invitations</Header>

    {#await invitesPromise}
      <p>Loading invites…</p>
    {:then invites}
      {#if invites.length === 0}
        <p>No pending invites.</p>
      {:else}
        <ul>
          {#each invites as invite}
            <li>
              <p>Invited as <strong>{invite.role}</strong></p>
              <Button small on:click={() => handleAccept(invite)} disabled={busyId === invite.id}>
                Accept
              </Button>
              <Button small on:click={() => handleDecline(invite)} disabled={busyId === invite.id}>
                Decline
              </Button>
            </li>
          {/each}
        </ul>
      {/if}
    {/await}
  </ContentFrame>
  </main>

  <style lang="scss">
  @use "src/styles/tokens" as *;
  .page {
    background-color: $background-color;
    min-height: 100%;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    margin-bottom: 1rem;
  }
</style>