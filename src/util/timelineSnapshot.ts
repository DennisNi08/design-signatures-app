/*
 * Copyright (c) 2021, Design Awareness Contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import { get } from "svelte/store";
import type { AsyncProject } from "../data/schema";
import { colorScheme } from "./colorScheme";
import { MONTH_SHORT_NAME } from "./date";
import dotTimeline from "./dotTimeline";
import { bucketByWeek } from "./weeklyTimeline";

const PAD = 16;
const BOTTOM_PAD = 24;
const LINE_HEIGHT = 22;
const NOTE_GAP = 8;
const DATE_COL_WIDTH = 48;
const TEXT_COL_GAP = 10;
const HEADING_FONT = "600 14px Inter, sans-serif";
const BODY_FONT = "500 13px Inter, sans-serif";

const LIGHT_THEME = {
  background: "#ffffff",
  heading: "#212121",
  text: "#212121",
  textSecondary: "#757575",
};
const DARK_THEME = {
  background: "#212121",
  heading: "#ffffff",
  text: "#ffffff",
  textSecondary: "#bdbdbd",
};

function formatDate(d: Date): string {
  return `${MONTH_SHORT_NAME[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Greedily wraps `text` to fit within `maxWidth`, returning one or more lines. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (ctx.measureText(attempt).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Renders the project's dot-grid timeline (same as the Export screen) to an offscreen canvas. */
function renderTimelineCanvas(project: AsyncProject, dpi: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const action = dotTimeline(canvas, {
      project,
      dpi,
      showNotes: true,
      showDates: true,
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        action.destroy();
        resolve(canvas);
      });
    });
  });
}

/**
 * Builds a single PNG combining the project's dot-grid timeline (as seen in
 * the Export screen) with a plain-text list of the most recent week's
 * notes underneath — a static snapshot suitable for pasting somewhere that
 * can't embed the live, interactive view (e.g. a Google Site).
 */
export async function generateTimelineSnapshot(project: AsyncProject): Promise<Blob> {
  const dpi = Math.min(2, window.devicePixelRatio || 1);
  const theme = get(colorScheme) === "dark" ? DARK_THEME : LIGHT_THEME;

  const timelineCanvas = await renderTimelineCanvas(project, dpi);

  const weeks = bucketByWeek(
    project.entries,
    project.designModel.activities.length,
    project.periodAlignment
  );
  const mostRecent = weeks[weeks.length - 1];

  const noteLines: { heading: string; text: string }[] = [];
  if (mostRecent) {
    for (const entry of mostRecent.entries) {
      const dateLabel = formatDate(entry.period);
      if (entry.note) {
        noteLines.push({ heading: dateLabel, text: entry.note });
      }
      for (let i = 0; i < project.designModel.activities.length; i++) {
        const note = entry.data[i]?.note;
        if (note) {
          noteLines.push({
            heading: dateLabel,
            text: `${project.designModel.activities[i].name}: ${note}`,
          });
        }
      }
    }
  }

  const widthCss = timelineCanvas.width / dpi;
  const headingText = mostRecent
    ? `Notes for week of ${formatDate(mostRecent.weekStart)}`
    : "Notes";
  const emptyText = "No notes logged for this week yet.";

  // Measure wrapped note lines using a scratch context at CSS-pixel scale.
  // The date label gets its own fixed-width column, so the text column's
  // wrap width never has to account for a variable-length prefix.
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d")!;
  measureCtx.font = BODY_FONT;
  const textColX = PAD + DATE_COL_WIDTH + TEXT_COL_GAP;
  const maxTextWidth = widthCss - textColX - PAD;
  const noteBlocks: { dateLabel: string; lines: string[] }[] = noteLines.map(
    ({ heading, text }) => ({
      dateLabel: heading,
      lines: wrapText(measureCtx, text, maxTextWidth),
    })
  );

  const HEADING_HEIGHT = LINE_HEIGHT;
  let notesHeightCss = PAD + HEADING_HEIGHT;
  if (noteBlocks.length === 0) {
    notesHeightCss += LINE_HEIGHT;
  } else {
    for (const block of noteBlocks) {
      notesHeightCss += Math.max(1, block.lines.length) * LINE_HEIGHT + NOTE_GAP;
    }
  }
  notesHeightCss += BOTTOM_PAD;

  const notesCanvas = document.createElement("canvas");
  notesCanvas.width = timelineCanvas.width;
  notesCanvas.height = Math.round(notesHeightCss * dpi);
  const notesCtx = notesCanvas.getContext("2d")!;
  notesCtx.scale(dpi, dpi);
  notesCtx.fillStyle = theme.background;
  notesCtx.fillRect(0, 0, widthCss, notesHeightCss);
  notesCtx.textBaseline = "top";
  notesCtx.fillStyle = theme.heading;
  notesCtx.font = HEADING_FONT;
  notesCtx.fillText(headingText, PAD, PAD);

  let y = PAD + HEADING_HEIGHT;
  if (noteBlocks.length === 0) {
    notesCtx.font = BODY_FONT;
    notesCtx.fillStyle = theme.textSecondary;
    notesCtx.fillText(emptyText, PAD, y);
  } else {
    notesCtx.font = BODY_FONT;
    for (const block of noteBlocks) {
      notesCtx.fillStyle = theme.textSecondary;
      notesCtx.fillText(block.dateLabel, PAD, y);
      notesCtx.fillStyle = theme.text;
      block.lines.forEach((line, i) => {
        notesCtx.fillText(line, textColX, y + i * LINE_HEIGHT);
      });
      y += Math.max(1, block.lines.length) * LINE_HEIGHT + NOTE_GAP;
    }
  }

  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = timelineCanvas.width;
  finalCanvas.height = timelineCanvas.height + notesCanvas.height;
  const finalCtx = finalCanvas.getContext("2d")!;
  finalCtx.drawImage(timelineCanvas, 0, 0);
  finalCtx.drawImage(notesCanvas, 0, timelineCanvas.height);

  return new Promise((resolve, reject) => {
    finalCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to generate snapshot image."));
    });
  });
}
