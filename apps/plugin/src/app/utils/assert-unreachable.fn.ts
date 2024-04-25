/**
 * Function that ensures that the associated code is unreachable
 * Reference: https://stackoverflow.com/questions/39419170/how-do-i-check-that-a-switch-block-is-exhaustive-in-typescript
 * @param _x never!
 */
export function assertUnreachable(_x: never): never {
  throw new Error("Didn't expect to get here");
}
