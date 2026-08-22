<!--
  TEMPORARY test page — verify Firestore create/read works, then delete this
  file and its route entry once confirmed.
-->
<script lang="ts">
  import { createProject, getUserProjects } from "../data/firestoreProjects";
  import { getUser } from "../data/authState.svelte";
  import BackButton from "../components/BackButton.svelte";
  import Header from "../components/type/Header.svelte";
  import ContentFrame from "../components/layout/ContentFrame.svelte";

  let log: string[] = $state([]);
  let projects: any[] = $state([]);
  let busy = $state(false);

  function addLog(msg: string) {
    log = [...log, `[${new Date().toLocaleTimeString()}] ${msg}`];
  }

  async function testCreate() {
    busy = true;
    addLog("Creating test project…");
    try {
      const id = await createProject({
        name: "Test Project " + Date.now(),
        description: "Created from FirestoreTest page",
      } as any);
      addLog(`✅ Created project with id: ${id}`);
    } catch (err) {
      addLog(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      console.error(err);
    } finally {
      busy = false;
    }
  }

  async function testRead() {
    busy = true;
    addLog("Fetching your projects…");
    try {
      const result = await getUserProjects();
      projects = result;
      addLog(`✅ Found ${result.length} project(s)`);
    } catch (err) {
      addLog(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      console.error(err);
    } finally {
      busy = false;
    }
  }
</script>

<main class="device-frame page">
  <ContentFrame>
    <BackButton href="/settings/" />
    <Header>Firestore Test</Header>

    <p>Signed in as: {getUser()?.email ?? "not signed in"}</p>

    <p>
      <button onclick={testCreate} disabled={busy}>Create test project</button>
      <button onclick={testRead} disabled={busy}>Read my projects</button>
    </p>

    <h3>Projects found:</h3>
    <pre>{JSON.stringify(projects, null, 2)}</pre>

    <h3>Log:</h3>
    <pre>{log.join("\n")}</pre>
  </ContentFrame>
</main>