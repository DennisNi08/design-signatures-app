/*
 * Copyright (c) 2021, Design Awareness Contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import { newRealtimeSession } from "../data/database";
import type { RealtimeProject, RealtimeSession } from "../data/schema";
import { setInArray } from "./array";

interface ActivityStateDescriptor {
  status: boolean;
  currentDuration: number;
  totalActivityTime: number;
}

function _noop() {}

/**
 * The amount of time the user has to "undo" a recent toggle,
 * effectively debouncing toggles such that no resulting on or off
 * period will be shorter than this value.
 */
const TOGGLE_UNDO_TIME = 1000;

/**
 * Controller for session tracking. Manages individual activity states and
 * writing to Sessions.
 */
export default class SessionTracker {
  private project: RealtimeProject;
  readonly session: RealtimeSession;
  private activityStates: boolean[];
  private pastTimes: number[];
  private lastToggleTime: number[];
  private hasAddedToProject = false;
  private getTime: () => number;
  private invalidate: () => void;
  readonly done = false;

  /**
   * When true, turning an activity on will cause all other activities
   * to turn off. Can be updated throughout the SessionTracker's
   * lifecycle if necessary.
   */
  singleActivity = false;

  /**
   * Initialize a new SessionTracker. Creates a new Session on the given
   * Project. The Session will not be attached to the project until `save()`
   * is called for the first time.
   * @param project Project for which tracking will occur
   * @param getTime getter for current session time
   * @param invalidate optional callback - will be called when data may have
   * changed. May be needed to trick the Svelte compiler into rerendering when
   * state changes:
   * let tracker = new SessionTracker(project, getTime, () => {
   *   // looks like a no-op, but the compiler will instrument this in order
   *   // to rerender UI that depends on `tracker`
   *   tracker = tracker;
   * });
   */
  constructor(
    project: RealtimeProject,
    getTime: () => number,
    invalidate: () => void = _noop
  ) {
    this.project = project;
    this.session = newRealtimeSession();
    this.session.projectId = project.id;
    this.activityStates = project.designModel.activities.map(() => false);
    this.pastTimes = this.activityStates.map(() => -1);
    this.lastToggleTime = this.activityStates.map(() => -1);

    this.session.data = this.activityStates.map(() => []);

    this.invalidate = invalidate;
    this.getTime = getTime;

    // bind methods
    this.save = this.save.bind(this);
    this.toggle = this.toggle.bind(this);
    this.off = this.off.bind(this);
    this.on = this.on.bind(this);
    this.getActivityState = this.getActivityState.bind(this);
  }

  /**
   * Save session to the database. The first time this is called, the
   * session will be added to the project and the project will also be
   * saved.
   */
  async save() {
    this.session.duration = this.getTime();
    if (!this.hasAddedToProject) {
      this.project.sessions = [...this.project.sessions, this.session];
      this.hasAddedToProject = true;
      await this.project.save();
    } else {
      await this.session.save();
    }
  }

  /**
   * Toggles an activity state
   * @param i which activity to toggle
   */
  toggle(i: number) {
    let time = this.getTime();
    if (this.activityStates[i]) {
      this.off(i, time);
    } else {
      this.on(i, time);
    }
  }

  /**
   * Turns an activity off
   * @param i which activity to turn off
   * @param time current tracking time to record
   * @param suppressInvalidation if true, don't call invalidate
   */
  off(i: number, time = this.getTime(), suppressInvalidation = false) {
    if (!this.activityStates[i]) return;
    let timeSinceLastToggle = time - this.lastToggleTime[i];

    if (
      timeSinceLastToggle < TOGGLE_UNDO_TIME &&
      this.lastToggleTime[i] !== -1
    ) {
      // if activity was just turned on, remove the last entry instead
      // of creating a new one.
      this.session.data = setInArray(
        this.session.data,
        i,
        this.session.data[i].slice(0, -1)
      );
      // we shouldn't undo any more, so this will ensure that the next
      // toggle always creates a new entry.
      this.lastToggleTime[i] = -1;
    } else {
      // complete the current entry
      let data = this.session.data[i];
      let lastElIdx = data.length - 1;
      data = setInArray(data, lastElIdx, [data[lastElIdx][0], time]);
      this.session.data = setInArray(this.session.data, i, data);
      // we shouldn't undo any more, so this will ensure that the next
      // toggle always ƒinishes the current entry.
      this.lastToggleTime[i] = time;
      let duration = time - data[lastElIdx][0];
      this.pastTimes[i] += duration;
    }
    this.activityStates[i] = false;

    if (!suppressInvalidation) {
      this.invalidate();
    }
  }

  /**
   * Turns an activity on
   * @param i which activity to turn on
   * @param time current tracking time to record
   */
  on(i: number, time = this.getTime()) {
    if (this.activityStates[i]) return;
    let timeSinceLastToggle = time - this.lastToggleTime[i];

    if (
      timeSinceLastToggle < TOGGLE_UNDO_TIME &&
      this.lastToggleTime[i] !== -1
    ) {
      // if activity was just turned off, re-enable the last entry instead
      // of creating a new one.
      let data = this.session.data[i];
      let lastElIdx = data.length - 1;
      let [lastOn, lastOff] = data[lastElIdx];
      let oldDuration = lastOff - lastOn;
      this.pastTimes[i] -= oldDuration;
      data = setInArray(data, lastElIdx, [lastOn, -1]);
      this.session.data = setInArray(this.session.data, i, data);
      // we shouldn't undo any more, so this will ensure that the next
      // toggle always ƒinishes the current entry.
      this.lastToggleTime[i] = -1;
    } else {
      // add a new entry to the session data
      this.session.data = setInArray(this.session.data, i, [
        ...this.session.data[i],
        [time, -1],
      ]);
      this.lastToggleTime[i] = time;
    }
    this.activityStates[i] = true;

    // in single activity mode, turn all other activities off
    if (this.singleActivity) {
      this.activityStates.forEach((state, j) => {
        if (state && i !== j) {
          this.off(j, time, true);
        }
      });
    }

    this.invalidate();
  }

  /**
   * Rewind the tracking state to the given time, so that the state
   * is changed back to what it would have been at that time.
   * Note that the time provider should also update its time, as the
   * SessionTracker cannot control that.
   * @param time time to rewind back to
   */
  rewindTo(time: number) {
    // clear last activation times
    this.session.data = this.session.data.map((data, i) => {
      let on = false;
      // remove pairs that start after the cutoff time
      // (inefficient!)
      let mutableData = data.filter(([start]) => start < time);

      // need to check the last pair to see if the activity has ended or not
      if (mutableData.length) {
        let lastIdx = mutableData.length - 1;
        if (mutableData[lastIdx][1] > time || mutableData[lastIdx][1] === -1) {
          on = true;
          mutableData[lastIdx] = [mutableData[lastIdx][0], -1];
        }
      }
      this.activityStates[i] = on;
      this.lastToggleTime[i] = -1;
      return mutableData;
    });

    // remove notes from later than the rewound-to time
    this.session.notes = this.session.notes.filter((note) => {
      if (note.time > time) {
        note.remove();
        return false;
      }
      return true;
    });

    this.invalidate();
  }

  /**
   * Get the current state of an activity
   * @param i which activity to get the state of
   * @returns an ActivityStateDescriptor describing the given activity
   */
  getActivityState(i: number): ActivityStateDescriptor {
    let status = this.activityStates[i];
    let currentDuration = -1;
    let totalActivityTime = this.pastTimes[i];
    if (status) {
      currentDuration = this.getTime() - this.lastToggleTime[i];
      totalActivityTime += currentDuration;
    }
    return {
      status,
      currentDuration,
      totalActivityTime,
    };
  }
}
