/**
 * Delay processing by x milliseconds
 * Reference: https://stackoverflow.com/questions/14226803/wait-5-seconds-before-executing-next-line
 * @param ms duration to delay in milliseconds
 */
export const delay = (ms: number): Promise<void> =>
  new Promise((res) => setTimeout(res, ms));
