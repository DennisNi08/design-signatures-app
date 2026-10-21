<!--
  Copyright (c) 2021, Design Awareness Contributors.
  SPDX-License-Identifier: BSD-3-Clause
-->
<script lang="ts">
  import { getProjectOrFail } from "../data/database";
  import type { AsyncProject } from "../data/schema";
  import { MONTH_SHORT_NAME } from "../util/date";
  import { bucketByWeek, type WeekBucket } from "../util/weeklyTimeline";

  export let params: { id: string };

  interface LoadedData {
    project: AsyncProject;
    weeks: WeekBucket[];
    mostRecent?: WeekBucket;
    maxWeekTotal: number;
  }

  async function load(id: string): Promise<LoadedData> {
    const [type, project] = await getProjectOrFail(id);
    if (type !== "AsyncProject") {
      throw new Error("This embed only supports async projects.");
    }
    const asyncProject = project as AsyncProject;
    const weeks = bucketByWeek(
      asyncProject.entries,
      asyncProject.designModel.activities.length,
      asyncProject.periodAlignment
    );
    const maxWeekTotal = Math.max(
      1,
      ...weeks.map((w) => w.activityMinutes.reduce((a, b) => a + b, 0))
    );
    return {
      project: asyncProject,
      weeks,
      mostRecent: weeks[weeks.length - 1],
      maxWeekTotal,
    };
  }

  function formatDate(d: Date): string {
    return `${MONTH_SHORT_NAME[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
  function formatWeekRange(weekStart: Date): string {
    const end = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
    return `${formatDate(weekStart)} – ${formatDate(end)}`;
  }
  function weekTotal(week: WeekBucket): number {
    return week.activityMinutes.reduce((a, b) => a + b, 0);
  }
  function segmentWidthPct(week: WeekBucket, activityIndex: number): number {
    const total = weekTotal(week);
    if (!total) return 0;
    return (week.activityMinutes[activityIndex] / total) * 100;
  }

  let promise = load(params.id);
</script>

<div class="embed-page">
  {#await promise}
    <p class="status">Loading…</p>
  {:then { project, weeks, mostRecent, maxWeekTotal }}
    <h1>{project.name}</h1>
    <div class="legend">
      {#each project.designModel.activities as activity}
        <span class="legend-item choose-theme-color" style="--light:#{activity.color[0]};--dark:#{activity.color[1]}">
          <span class="legend-dot"></span>
          {activity.name}
        </span>
      {/each}
    </div>

    {#if weeks.length === 0}
      <p class="empty">No entries logged yet.</p>
    {:else}
      <div class="timeline">
        {#each weeks as week (week.weekStart.getTime())}
          <div class="week-row" class:current={week === mostRecent}>
            <div class="week-label">{formatWeekRange(week.weekStart)}</div>
            <div class="week-bar-track">
              <div class="week-bar" style="width:{(weekTotal(week) / maxWeekTotal) * 100}%">
                {#each project.designModel.activities as activity, i}
                  {#if week.activityMinutes[i] > 0}
                    <span
                      class="segment choose-theme-color"
                      style="--light:#{activity.color[0]};--dark:#{activity.color[1]};width:{segmentWidthPct(
                        week,
                        i
                      )}%"
                      title="{activity.name}: {Math.round(week.activityMinutes[i])} min"
                    ></span>
                  {/if}
                {/each}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <h2>
      {mostRecent ? `Notes for week of ${formatDate(mostRecent.weekStart)}` : "Notes"}
    </h2>
    {#if mostRecent && mostRecent.entries.length}
      {@const notesExist = mostRecent.entries.some(
        (e) => e.note || e.data.some((d) => d.note)
      )}
      {#if notesExist}
        <ul class="notes-list">
          {#each mostRecent.entries as entry}
            {#if entry.note}
              <li>
                <span class="note-date">{formatDate(entry.period)}</span>
                <span class="note-text">{entry.note}</span>
              </li>
            {/if}
            {#each project.designModel.activities as activity, i}
              {#if entry.data[i]?.note}
                <li>
                  <span class="note-date">{formatDate(entry.period)}</span>
                  <span class="note-text"><strong>{activity.name}:</strong> {entry.data[i].note}</span>
                </li>
              {/if}
            {/each}
          {/each}
        </ul>
      {:else}
        <p class="empty">No notes logged for this week yet.</p>
      {/if}
    {:else}
      <p class="empty">No notes logged for this week yet.</p>
    {/if}
  {:catch}
    <p class="status">This project timeline isn't available.</p>
  {/await}
</div>

<style lang="scss">
  @use "src/styles/tokens" as *;
  @use "src/styles/type" as *;

  .embed-page {
    padding: 1rem;
    max-width: 640px;
  }
  .status,
  .empty {
    @include type-style($type-body);
    color: $text-secondary-color;
  }
  h1 {
    @include type-style($type-header);
    margin: 0 0 0.5rem 0;
  }
  h2 {
    @include type-style($type-section-header);
    margin: 1.25rem 0 0.5rem 0;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .legend-item {
    @include type-style($type-caption);
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: $text-primary-color;
  }
  .legend-dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    display: inline-block;
  }
  .choose-theme-color {
    --theme-color: var(--light);
    @media (prefers-color-scheme: dark) {
      --theme-color: var(--dark);
    }
  }
  .legend-dot {
    background: var(--theme-color);
  }
  .week-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.15rem 0;
  }
  .week-row.current .week-label {
    font-weight: 600;
    color: $text-primary-color;
  }
  .week-label {
    @include type-style($type-caption);
    flex: 0 0 6.5rem;
    text-align: right;
    color: $text-secondary-color;
  }
  .week-bar-track {
    flex: 1;
    background: $timeline-gridline-color;
    border-radius: 4px;
    height: 1.1rem;
    overflow: hidden;
  }
  .week-bar {
    height: 100%;
    display: flex;
    min-width: 2px;
  }
  .segment {
    height: 100%;
    background: var(--theme-color);
  }
  .notes-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .notes-list li {
    @include type-style($type-body);
    display: flex;
    gap: 0.5rem;
  }
  .note-date {
    @include type-style($type-note-meta);
    flex: 0 0 3rem;
    color: $text-ghost-color;
  }
  .note-text {
    flex: 1;
    word-break: break-word;
  }
</style>
