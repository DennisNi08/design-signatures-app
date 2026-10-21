<!--
  Copyright (c) 2021, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts">
  import createIcon from "@iconify-icons/ic/baseline-create";
  import undoIcon from "@iconify-icons/ic/baseline-history";
  import pauseIcon from "@iconify-icons/ic/baseline-pause";
  import playIcon from "@iconify-icons/ic/baseline-play-arrow";
  import settingsIcon from "@iconify-icons/ic/baseline-settings";
  import stopIcon from "@iconify-icons/ic/baseline-stop";
  import { onDestroy } from "svelte";
  import { pop, push, replace } from "svelte-spa-router";
  import ActivitySlat from "../components/ActivitySlat.svelte";
  import ActivityToken from "../components/ActivityToken.svelte";
  import Button from "../components/Button.svelte";
  import ButtonGroup from "../components/ButtonGroup.svelte";
  import Checkbox from "../components/Checkbox.svelte";
  import ColorPicker from "../components/DesignModel/ColorPicker.svelte";
  import InputField from "../components/InputField.svelte";
  import ContentFrame from "../components/layout/ContentFrame.svelte";
  import Link from "../components/Link.svelte";
  import MiniTimeline from "../components/MiniTimeline.svelte";
  import Modal from "../components/Modal.svelte";
  import SelectField from "../components/SelectField.svelte";
  import TrackingTimer from "../components/TrackingTimer.svelte";
  import UndoTrackingModal from "../components/UndoTrackingModal.svelte";
  import CONFIG from "../data/config";
  import { getRealtimeProject, invalidateProjectCache, newTimedNote } from "../data/database";
  import { pushRecentProject } from "../data/recentProjects";
  import type { RealtimeProject } from "../data/schema";
  import { setInArray } from "../util/array";
  import { delay } from "../util/delay";
  import { goUpSafe } from "../util/history";
  import useInterval from "../util/interval";
  import { shortDuration } from "../util/time";
  import SessionTracker from "../util/track";

  type ModalName = "note" | "paused" | "options" | "info" | "undo";

  export let params: { id: string; wild: ModalName };

  const TIMER_TICK = 100;
  const SAVE_FREQUENCY = 1000 * 60;

  let tracker: SessionTracker;

  let projectTime = 0;
  let timerDisplayMode: "project" | "session" | "none" = "session";
  let visualizationMode: "timeline" | "bundle" | "none" = "timeline";

  let errorLoading = false;
  let hasProject = false;
  // Bust the in-memory cache first so a fresh visit reflects any changes
  // other project members have saved since this tab last loaded it.
  invalidateProjectCache(params.id);
  let thenProject = getRealtimeProject(params.id);
  let project: RealtimeProject;
  thenProject.then((_project) => {
    if (!_project) {
      errorLoading = true;
      return;
    }
    project = _project;
    hasProject = true;
    projectTime = project.sessions
      .map((session) => session.duration)
      .reduce((a, b) => a + b, 0);
    tracker = new SessionTracker(
      project,
      () => subsessionTime + pastSessionTime,
      () => {
        tracker = tracker;
      },
    );
  });

  //#region timing
  let activeSubsession = false;
  let pastSessionTime = 0;
  let thisSubsessionStart = 0;
  let subsessionTime = 0;

  function startTracking() {
    activeSubsession = true;
    thisSubsessionStart = Date.now();
    subsessionTime = 0;
  }

  function tick() {
    let tickTime = Date.now();
    subsessionTime = tickTime - thisSubsessionStart;
  }

  function stopTracking() {
    if (activeSubsession) {
      tick();
      pastSessionTime += subsessionTime;
      subsessionTime = 0;
      activeSubsession = false;
    }
  }

  const [enableInterval, destroyInterval] = useInterval(
    { start: startTracking, tick, stop: stopTracking },
    TIMER_TICK,
  );

  const [enableSaveInterval, destroySaveInterval] = useInterval(
    {
      start() {},
      tick: () => tracker?.save(),
      stop() {},
    },
    SAVE_FREQUENCY,
  );

  // tracking is enabled when no modal is open
  $: enableInterval(hasProject && !params.wild);
  $: enableSaveInterval(hasProject && !params.wild);
  //#endregion timing

  //#region modals
  // bind this to a Modal's `visible` to enable closing it via tap on scrim
  // an inner Link[up] or closeModal() will also work!
  let bindModalOpen = true;
  let goingUp = false;

  async function closeModal() {
    goingUp = true;
    await goUpSafe(`/projects/${params.id}/track/`);
    bindModalOpen = true;
    goingUp = false;
  }

  const openModal = (modalName: ModalName) => () => {
    push(`/projects/${params.id}/track/${modalName}`);
  };
  const replaceModal = (modalName: ModalName) => () => {
    replace(`/projects/${params.id}/track/${modalName}`);
  };

  function pause() {
    openModal("paused")();
    tracker.save();
  }

  // FIXME: Don't duplicate activity type here.
  interface ActivitySpec {
    name: string;
    code: string;
    description: string;
    color: readonly [string, string];
    index: number;
  }
  let editingActivity = false;
  let selectedActivity: ActivitySpec, selectedActivityTemp: ActivitySpec;
  const openInfo = (i: number) => () => {
    editingActivity = false;
    selectedActivity = {
      ...project.designModel.activities[i],
      index: i,
    };
    openModal("info")();
  };
  const infoButtons = [
    {
      label: "Edit",
      onClick: function () {
        selectedActivityTemp = { ...selectedActivity };
        editingActivity = true;
      },
    },
    {
      label: "Close",
      onClick: closeModal,
    },
  ];
  const infoButtonsEditing = [
    {
      label: "Cancel",
      onClick: function () {
        editingActivity = false;
      },
    },
    {
      label: "Save",
      onClick: function () {
        const model = project.designModel;
        const i = selectedActivity.index;
        selectedActivity = { ...selectedActivityTemp };
        let { code, color, description, name } = selectedActivityTemp;
        let newActivity = {
          code: code.toUpperCase(),
          color,
          description,
          name,
        };
        model.activities = setInArray(model.activities, i, newActivity);
        model.save();
        // This no-op is instrumented by svelte and updates accordingly
        project.designModel = project.designModel;
        editingActivity = false;
      },
    },
  ];
  $: if (params.wild === "info" && !selectedActivity) {
    closeModal();
  }

  async function stopTrackingButton() {
    if (params.wild) {
      await pop();

      // in safari, we seem to need an extra event cycle
      // to do the two navigation actions in a row. whatever.
      await delay(0);
    }
    goUpSafe(`/projects/${params.id}/`);
  }

  $: if (params.wild && !bindModalOpen && !goingUp) closeModal();
  //#endregion modals

  //#region component destroy
  onDestroy(async () => {
    destroyInterval();
    destroySaveInterval();
    let project = await thenProject;
    if (!project) return;
    stopAllActivities(pastSessionTime);
    tracker.save();
    project.modified = new Date();
    pushRecentProject(project.id);
    project.save();
  });

  function stopAllActivities(endTime: number) {
    let numActivities = tracker.session.data.length;
    for (let i = 0; i < numActivities; i++) {
      if (tracker.getActivityState(i).status) {
        tracker.off(i, endTime, true);
      }
    }
  }
  //#endregion

  //#region blur & close
  function blur() {
    tracker.save();
  }

  let suppressBeforeUnload = false;
  (async function () {
    suppressBeforeUnload = await CONFIG.getDevSuppressBeforeUnload();
  })();

  function beforeUnload(evt: BeforeUnloadEvent) {
    if (!suppressBeforeUnload) {
      evt.preventDefault();
      evt.returnValue = "You are currently tracking a project!";
      return "You are currently tracking a project!";
    }
  }
  //#endregion

  //#region notes
  let noteText = "";
  let noteSaving = false;
  async function saveNote() {
    noteSaving = true;
    try {
      const project = await thenProject;
      if (!tracker.session.id) {
        await tracker.session.save();
      }
      const note = newTimedNote();
      // firestore.rules authorizes TimedNotes via their parent session
      note.sessionId = tracker.session.id;
      note.content = noteText;
      note.time = pastSessionTime;
      tracker.session.notes = [...tracker.session.notes, note];
      await project.save();
      await closeModal();
      noteText = "";
    } finally {
      noteSaving = false;
    }
  }
  function closeNote() {
    closeModal();
    noteText = "";
  }
  //#endregion
</script>

<svelte:window on:beforeunload={beforeUnload} on:blur={blur} />
<main class="device-frame page">
  <ContentFrame>
    {#if hasProject}
      <div class="tracking-frame">
        <div class="top-bar">
          <TrackingTimer
            bind:displayMode={timerDisplayMode}
            sessionTime={subsessionTime + pastSessionTime}
            {projectTime}
          />
          <div class="flex-spacer"></div>
          <Button small icon={settingsIcon} on:click={openModal("options")}>
            Options
          </Button>
        </div>

        <div class="flexible-toggle-area">
          {#each project.designModel.activities as { color, name }, i (i)}
            <ActivitySlat
              activityName={name}
              activityColor={color}
              index={i}
              showInfo={openInfo(i)}
              {tracker}
            />
          {/each}
        </div>

        {#if visualizationMode !== "none"}
          <MiniTimeline
            bind:timelineMode={visualizationMode}
            shouldUpdate={hasProject && !params.wild}
            session={tracker.session}
            currentTime={subsessionTime + pastSessionTime}
            colors={project.designModel.activities.map(({ color }) => color)}
          />
        {/if}

        <ButtonGroup fill>
          <Button icon={createIcon} on:click={openModal("note")}>
            Add note
          </Button>
          <Button icon={pauseIcon} on:click={pause}>Pause</Button>
        </ButtonGroup>
      </div>

      {#if params.wild === "note"}
        <Modal
          maxWidth
          bind:visible={bindModalOpen}
          closeWithScrim={false}
          status="Tracking is paused."
          buttons={[
            { label: "Cancel", onClick: closeNote, disabled: noteSaving },
            {
              label: "Save",
              onClick: saveNote,
              disabled: noteSaving || !noteText,
            },
          ]}
        >
          <InputField
            large
            xlarge
            bind:value={noteText}
            label={timerDisplayMode === "none"
              ? "Add note"
              : "Add note at " +
                shortDuration(
                  timerDisplayMode === "project"
                    ? pastSessionTime + projectTime
                    : pastSessionTime,
                )}
          />
        </Modal>
      {:else if params.wild === "paused"}
        <Modal
          bind:visible={bindModalOpen}
          status="Tracking is paused."
          buttons={[
            { label: "Stop", onClick: stopTrackingButton, icon: stopIcon },
            { label: "Resume", onClick: closeModal, icon: playIcon },
          ]}
        >
          Resume your project to continue tracking. If you stop tracking now,
          you can always continue later.
        </Modal>
      {:else if params.wild === "options"}
        <Modal
          bind:visible={bindModalOpen}
          status="Tracking is paused."
          title="Tracking Options"
          buttons={[{ label: "Done", onClick: closeModal }]}
        >
          <Button on:click={replaceModal("undo")} icon={undoIcon}
            >Undo tracking</Button
          >
          <SelectField
            label="Timer"
            bind:value={timerDisplayMode}
            options={[
              ["session", "Session time"],
              ["project", "Project time"],
              ["none", "None (hide timer)"],
            ]}
          />
          <SelectField
            label="Visualization"
            bind:value={visualizationMode}
            options={[
              ["timeline", "Mini timeline"],
              ["bundle", "Tree map"],
              ["none", "None (hide visualization)"],
            ]}
          />
          <Checkbox
            label="Single activity mode"
            helptext="When enabled, only one activity can be active at a time."
            bind:checked={tracker.singleActivity}
          />
        </Modal>
      {:else if params.wild === "info" && selectedActivity}
        <Modal
          bind:visible={bindModalOpen}
          status="Tracking is paused"
          title={editingActivity ? "Edit Activity" : selectedActivity.name}
          buttons={editingActivity ? infoButtonsEditing : infoButtons}
        >
          {#if editingActivity}
            {#if !project.designModel.wellKnown}
              <InputField
                label="Activity name"
                bind:value={selectedActivityTemp.name}
              />
              <InputField
                label="Activity code"
                bind:value={selectedActivityTemp.code}
                maxlength="5"
                style="text-transform: uppercase"
              />
            {/if}
            <ColorPicker bind:color={selectedActivityTemp.color} />

            {#if !project.designModel.wellKnown}
              <InputField
                large
                label="Description"
                bind:value={selectedActivityTemp.description}
              />
              <p class="hint">
                Changes will also apply to any other projects using the same
                design model.
              </p>
            {:else}
              <p class="hint">
                Activity names, codes, and descriptions cannot be changed for
                built-in design models.
              </p>
            {/if}
          {:else}
            <ActivityToken
              code={selectedActivity.code}
              color={selectedActivity.color}
            />
            <p>{selectedActivity.description || "No description provided."}</p>
          {/if}
        </Modal>
      {:else if params.wild === "undo"}
        <UndoTrackingModal
          bind:visible={bindModalOpen}
          {closeModal}
          {undoIcon}
          bind:time={pastSessionTime}
          {tracker}
        />
      {/if}
    {:else if errorLoading}
      This project does not exist.
      <Link href="/" up>Go home</Link>
    {:else}Loading…{/if}
  </ContentFrame>
</main>

<style lang="scss">
  @use "src/styles/tokens" as *;
  @use "src/styles/type" as *;

  .device-frame {
    height: 100%;
    background-color: $alt-background-color;
    display: flex;
    > :global(div) {
      flex: 1;
    }
  }

  .hint {
    @include type-style($type-detail);
    color: $text-secondary-color;
  }

  .top-bar {
    display: flex;
    align-items: center;
    .flex-spacer {
      flex-grow: 1;
    }
  }

  .tracking-frame {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .flexible-toggle-area {
    $negative-margin-pad: -1rem;
    margin: calc(#{$block-vertical-spacing} + #{$negative-margin-pad})
      $negative-margin-pad $negative-margin-pad $negative-margin-pad;
    padding: -$negative-margin-pad;
    flex: 1;
    overflow-x: visible;
    overflow-y: auto;
  }
</style>
