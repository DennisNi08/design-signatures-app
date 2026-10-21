/*
 * Copyright (c) 2021, Design Awareness Contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type { AsyncActivityData, Weekday } from "design-awareness-data-types";
import { floorDateToWeekday, fromDate, makeDate } from "./date";

export interface WeeklyEntryLike {
  period: Date;
  note?: string;
  data: readonly AsyncActivityData[];
}

export interface WeekBucket {
  weekStart: Date;
  /** total minutes per activity index, summed across all entries in this week */
  activityMinutes: number[];
  /** entries whose normalized period falls in this week, sorted ascending */
  entries: WeeklyEntryLike[];
}

/** Maximum number of week rows rendered, to keep the embed a bounded height. */
export const MAX_WEEKS_DISPLAYED = 26;

/**
 * Returns the UTC midnight date of the start of the week containing `date`,
 * for a week that starts on weekday `alignment` — the same truncate-then-
 * floor normalization described for AsyncEntry.period.
 */
export function weekStartUTC(date: Date, alignment: Weekday): Date {
  return floorDateToWeekday(makeDate(fromDate(date)), alignment);
}

/**
 * Buckets entries into calendar weeks (aligned to `periodAlignment`),
 * summing per-activity minutes for each week, and filling in any
 * weeks that have no entries so the timeline has no gaps.
 * Returns buckets sorted ascending by week, truncated to the most
 * recent MAX_WEEKS_DISPLAYED weeks.
 */
export function bucketByWeek(
  entries: readonly WeeklyEntryLike[],
  numActivities: number,
  periodAlignment: number
): WeekBucket[] {
  if (entries.length === 0) return [];

  const byWeek = new Map<number, WeekBucket>();
  for (const entry of entries) {
    const weekStart = weekStartUTC(entry.period, periodAlignment);
    const key = weekStart.getTime();
    let bucket = byWeek.get(key);
    if (!bucket) {
      bucket = {
        weekStart,
        activityMinutes: new Array(numActivities).fill(0),
        entries: [],
      };
      byWeek.set(key, bucket);
    }
    bucket.entries.push(entry);
    for (let i = 0; i < numActivities; i++) {
      bucket.activityMinutes[i] += entry.data[i]?.value ?? 0;
    }
  }

  const sortedKeys = Array.from(byWeek.keys()).sort((a, b) => a - b);
  const firstWeek = sortedKeys[0];
  const lastWeek = sortedKeys[sortedKeys.length - 1];
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  const filled: WeekBucket[] = [];
  for (let t = firstWeek; t <= lastWeek; t += WEEK_MS) {
    const existing = byWeek.get(t);
    if (existing) {
      existing.entries.sort((a, b) => a.period.getTime() - b.period.getTime());
      filled.push(existing);
    } else {
      filled.push({
        weekStart: new Date(t),
        activityMinutes: new Array(numActivities).fill(0),
        entries: [],
      });
    }
  }

  if (filled.length > MAX_WEEKS_DISPLAYED) {
    return filled.slice(filled.length - MAX_WEEKS_DISPLAYED);
  }
  return filled;
}
