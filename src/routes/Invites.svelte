<script lang="ts">
  import BackButton from "../components/BackButton.svelte";
  import ContentFrame from "../components/layout/ContentFrame.svelte";
  import Header from "../components/type/Header.svelte";
  import Button from "../components/Button.svelte";
  import { getMyPendingInvites, acceptInvite, declineInvite, type ProjectInvite } from "../data/invites";

  let invitesPromise = getMyPendingInvites();
  let busyId: string | null = null;
  let actionError: string | null = null;

  async function respond(invite: ProjectInvite, action: (invite: ProjectInvite) => Promise<void>) {
    busyId = invite.id;
    actionError = null;
    try {
      await action(invite);
      invitesPromise = getMyPendingInvites();
    } catch (err) {
      console.error("Invite action failed", err);
      actionError = "Something went wrong. Please try again.";
    } finally {
      busyId = null;
    }
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
            <li class="invite-card">
            <div class="invite-info">
              <p class="project-name">{invite.projectName}</p>
              <p class="invited-by">
                Invited by {invite.invitedByName || invite.invitedByEmail}
              </p>
              <p class="role">Role: {invite.role}</p>
            </div>
            <div class="invite-actions">
              <Button small on:click={() => respond(invite, acceptInvite)} disabled={busyId === invite.id}>
                Accept
              </Button>
              <Button small on:click={() => respond(invite, declineInvite)} disabled={busyId === invite.id}>
                Decline
              </Button>
              </div>
            </li>
          {/each}
        </ul>
        {#if actionError}
          <p class="error">{actionError}</p>
        {/if}
      {/if}
    {:catch}
      <p class="error">Couldn't load your invites. Please refresh to try again.</p>
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
  .invite-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem;
    margin-bottom: 0.75rem;
    border-radius: 8px;
    border: 1px solid $input-border-color;
    background-color: $input-background-color;
  }
  .invite-info {
    flex: 1;
    min-width: 0;
  }
  .project-name {
    margin: 0 0 0.15rem 0;
    font-weight: 600;
  }
  .invited-by {
    margin: 0 0 0.15rem 0;
    font-size: 0.85rem;
    color: $text-secondary-color;
  }
  .role {
    margin: 0;
    font-size: 0.8rem;
    color: $text-secondary-color;
    text-transform: capitalize;
  }
  .error {
    color: $accent-danger-color;
  }
  .invite-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }
</style>