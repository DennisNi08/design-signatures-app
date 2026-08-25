/*
 * Copyright (c) 2021, Design Awareness Contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {AsyncProject, RealtimeProject} from "../data/schema";
/**
 * Recursively changes all tuples and arrays to readonly.
 */
export type DeepReadonly<I> =
  // NOTE: this first case accounts for Activity colors [string, string]
  // and RealtimeSession data points [number, number]. This case needs to be
  // first because otherwise the next case (T[]) will clobber tuples into
  // normal array types (e.g., number[], or worse, any[]) which would be less
  // than ideal. If only javascript had proper tuples!
  // If additional data types define 1- or 3+-element tuples, more cases
  // will have to be added here to account for that.
  I extends [infer A, infer B]
    ? readonly [A, B]
    : I extends (infer T)[]
    ? readonly DeepReadonly<T>[]
    : I extends Date
    ? I
    : {
        [K in keyof I]: DeepReadonly<I[K]>;
      };

/**
 * Changes all top-level properties to be non-optional.
 */
export type AllRequired<I> = {
  [K in keyof I]-?: I[K];
};

/**
 * Recursively changes all top-level and nested properties to be non-optional.
 */
export type DeepRequired<I> =
  // NOTE: May need to add exceptions to avoid mangling other object types:
  I extends Function | Date
    ? I
    : {
        [K in keyof I]-?: DeepRequired<I[K]>;
      };

/**
 * Change a single property type on an interface.
 * @param I interface to change a property type on
 * @param Prop name of the property to change
 * @param To new type for that property
 */
export type SetPropertyType<I, Prop extends keyof I, To> = {
  [K in keyof I]: K extends Prop ? To : I[K];
};

/** Get a promise result type */
export type ThenType<T> = T extends Promise<infer U> ? U : T;

/**
 * Changes multple property types on an interface.
 * @param I interface to change a property type on
 * @param PropDefs list of properties and the types to change them to
 *
 * @example
 * interface Test {
 *   a: string;
 *   b: number;
 *   c: boolean;
 * }
 *
 * type Result = SetPropertyTypes<
 *   Test,
 *   [
 *     ["a", number],
 *     ["b", string]
 *   ]
 * >
 * // Has the type:
 * Result {
 *   a: number;
 *   b: string;
 *   c: boolean;
 * }
 */
export type SetPropertyTypes<
  I,
  PropDefs extends [keyof I, any][]
> = PropDefs extends [[infer Prop, infer NewType], ...infer Rest]
  ? Prop extends keyof I
    ? Rest extends [keyof I, any][]
      ? SetPropertyTypes<SetPropertyType<I, Prop, NewType>, Rest>
      : never
    : never
  : I;

/**
 * Test for presence of a property
 * @param obj object to test
 * @param prop property name
 * @returns whether the property exists on the object
 */
export function hasOwnProperty<X extends {}, Y extends PropertyKey>(
  obj: X,
  prop: Y
): obj is [Extract<X, Record<Y, unknown>>] extends [never]
  ? X & Record<Y, unknown>
  : Extract<X, Record<Y, unknown>> {
  return obj.hasOwnProperty(prop);
}
export function isAsyncProject(
  p: RealtimeProject | AsyncProject
): p is AsyncProject {
  return "entries" in p;
}
export function isRealtimeProject(
  p: RealtimeProject | AsyncProject
): p is RealtimeProject {
  return "sessions" in p;
}
