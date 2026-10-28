import type { A1Device } from "../config";

/** "A1" for bus 0, "A2" for bus 1, ... (hardware buses only). */
export const busLabel = (bus: number) => `A${bus + 1}`;

/** The configured devices offered for one bus. Entries saved before buses existed belong to A1. */
export function outputsForBus(outputs: A1Device[], bus: number): A1Device[] {
  return outputs.filter((o) => (o.bus ?? 0) === bus);
}

/**
 * Which of `choices` is the device Voicemeeter reports on the bus, or -1 when
 * none is (nothing assigned, or a device that isn't in the list). Matched by
 * name, since Voicemeeter reports the name without its driver.
 */
export function activeOutputIndex(choices: A1Device[], device: string | undefined): number {
  if (!device) return -1;
  return choices.findIndex((c) => c.name === device);
}

/** The bus to show: the saved one if this edition has it, else A1. */
export function clampBus(bus: number, hwBusCount: number): number {
  return Number.isInteger(bus) && bus >= 0 && bus < hwBusCount ? bus : 0;
}
