// A small physical model of ferrofluid on a magnet, for the Ferrofluid
// visualizer.
//
// Ferrofluid is a liquid full of magnetic grains. Over a magnet it climbs
// into a ball, and once the field is strong enough its surface breaks into
// a lattice of sharp spikes (the Rosensweig instability). Two things give it
// its character:
//  - Hysteresis. A spike forms at a higher field than the one it collapses at,
//    so spikes snap into being and then hang on as the music dips.
//  - Stiff, lightly damped springs. A spike's height follows the local field
//    quickly and overshoots a little, so a kick makes every spike jump.
//
// The ball has radius 1 and spike sites spread evenly over it (a Fibonacci
// sphere). Each site's field is the magnet (the overall level) plus one band
// of the spectrum, bass at the bottom of the ball and treble at the top. With
// no signal at all the magnet is off and the fluid lies flat as a puddle.
//
// `dt` is in 60 Hz frames; every rate is time-based, so the fluid behaves the
// same at any frame rate.

import { perFrameAlpha } from "./frameLoop";

export interface FerroSite {
  /** Unit direction of the site on the ball, in the ball's own frame. */
  x: number;
  y: number;
  z: number;
  /** The same direction after the ball's spin, for drawing. */
  rx: number;
  ry: number;
  rz: number;
  /** Spike height, 0..MAX_HEIGHT; 1 is a full spike. */
  h: number;
  v: number;
  /** Whether the spike has formed (hysteresis). */
  on: boolean;
  /** Where in the spectrum the site listens: 0 = lowest band, 1 = highest. */
  bandPos: number;
  /** Indices of the six nearest sites; surface tension couples them. */
  neighbors: number[];
  /** Per-site variation, so the lattice doesn't move as one. */
  kickGain: number;
  threshold: number;
}

export interface FerroState {
  sites: FerroSite[];
  /** Mode-2 squash of the body: positive = wider than tall. */
  squish: number;
  squishV: number;
  /** 0 = flat puddle (no signal) .. 1 = gathered onto the magnet as a ball. */
  gather: number;
  /** Rotation of the ball about its vertical axis, radians. */
  spin: number;
  /** A pulse of extra field after each kick. */
  boost: number;
  kicked: boolean;
}

export interface FerroDrive {
  /** Overall loudness, 0..1. */
  level: number;
  /** Energy per band, low to high, 0..1; any number of bands. */
  bands: ArrayLike<number>;
  /** Kick onset, 0..1; a spike forms once per rise above 0.5. */
  onset: number;
  /** Reactivity gain: 1 at the default setting. */
  reactivity: number;
}

export const SITE_COUNT = 64;
/** Field at which a spike forms, and the lower one at which it collapses. */
export const FORM_FIELD = 0.5;
export const COLLAPSE_FIELD = 0.36;
export const MAX_HEIGHT = 1.2;

/** Spring stiffness and damping (per s²/per s), lightly underdamped. */
const STIFFNESS = 520;
const DAMPING = 19;
/** Surface tension: pull toward the neighbours' mean height. */
const COUPLING = 110;
/** Longest integration step, in seconds. */
const SUBSTEP = 0.004;
/** Velocity added to every formed spike by a full kick. */
const KICK = 1.9;
const SQUISH_KICK = 1.4;
const SQUISH_OMEGA = Math.PI * 2 * 2;
const SQUISH_DAMPING = 0.25;
/** Radians per 60 Hz frame. */
const SPIN = 0.0035;
/** Gather follows the signal: quick to climb into a ball, slow to slump. */
const GATHER_RISE = 0.025;
const GATHER_FALL = 0.006;
/** How much the body squashes at most, as a fraction. */
const MAX_SQUISH = 0.12;

/** Evenly spread sites on the unit sphere, top to bottom. */
export function sphereSites(count: number, random: () => number = Math.random): FerroSite[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const sites: FerroSite[] = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    const a = golden * i;
    sites.push({
      x: Math.cos(a) * r, y, z: Math.sin(a) * r,
      rx: 0, ry: 0, rz: 0,
      h: 0, v: 0, on: false,
      // Treble at the top, bass at the bottom. Consecutive sites sit far
      // apart in longitude, so neighbours still listen to different bands.
      bandPos: 1 - (i + 0.5) / count,
      neighbors: [],
      kickGain: 0.8 + random() * 0.4,
      threshold: 0.9 + random() * 0.2,
    });
  }
  for (const s of sites) {
    s.neighbors = sites
      .map((t, i) => [Math.hypot(t.x - s.x, t.y - s.y, t.z - s.z), i] as const)
      .filter(([d]) => d > 0)
      .sort((a, b) => a[0] - b[0])
      .slice(0, 6)
      .map(([, i]) => i);
  }
  return sites;
}

export function createFerro(random: () => number = Math.random): FerroState {
  const state: FerroState = {
    sites: sphereSites(SITE_COUNT, random),
    squish: 0, squishV: 0, gather: 0,
    spin: random() * Math.PI * 2,
    boost: 0, kicked: false,
  };
  rotate(state);
  return state;
}

function rotate(state: FerroState): void {
  const c = Math.cos(state.spin);
  const s = Math.sin(state.spin);
  for (const site of state.sites) {
    site.rx = site.x * c - site.z * s;
    site.ry = site.y;
    site.rz = site.x * s + site.z * c;
  }
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Advance the fluid by `dt` 60 Hz frames. */
export function stepFerro(state: FerroState, dt: number, drive: FerroDrive): void {
  const { sites } = state;
  const R = drive.reactivity;
  const seconds = dt / 60;

  // Signal switches the magnet on: the fluid climbs into a ball within a
  // second or two and slumps back to a puddle a few seconds after silence.
  const want = clamp((drive.level * R - 0.06) / 0.16, 0, 1);
  state.gather += (want - state.gather) * perFrameAlpha(want > state.gather ? GATHER_RISE : GATHER_FALL, dt);

  // Kicks, once per onset: formed spikes jump, the body squashes, and the
  // magnet gets a short pulse.
  const kicking = drive.onset > 0.5;
  if (kicking && !state.kicked) {
    for (const s of sites) if (s.on) s.v += KICK * drive.onset * R * s.kickGain;
    state.squishV += SQUISH_KICK * drive.onset * R;
    state.boost = Math.max(state.boost, drive.onset);
  }
  state.kicked = kicking;
  state.boost *= Math.pow(0.9, dt);

  // The field at each site decides whether its spike exists and how tall it
  // wants to be; forming and collapsing happen at different fields.
  const magnet = clamp(drive.level * 1.3 + state.boost * 0.3, 0, 1.2) * R;
  const bandCount = drive.bands.length;
  const targets = new Float32Array(sites.length);
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    const band = bandCount > 0 ? drive.bands[Math.round(s.bandPos * (bandCount - 1))] : 0;
    const field = magnet * 0.6 * s.threshold + band * 0.85 * R;
    if (!s.on && field > FORM_FIELD) s.on = true;
    else if (s.on && field < COLLAPSE_FIELD) s.on = false;
    targets[i] = s.on ? Math.min(MAX_HEIGHT, 0.3 + 1.3 * (field - COLLAPSE_FIELD)) : 0;
  }

  // Springs, in small steps so stiff spikes stay stable at any frame rate.
  const steps = Math.max(1, Math.ceil(seconds / SUBSTEP));
  const h = seconds / steps;
  for (let n = 0; n < steps; n++) {
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      let tension = 0;
      for (const j of s.neighbors) tension += sites[j].h - s.h;
      s.v += (STIFFNESS * (targets[i] - s.h) - DAMPING * s.v + COUPLING * tension) * h;
    }
    for (const s of sites) s.h = Math.max(0, s.h + s.v * h);
    state.squishV += (-SQUISH_OMEGA * SQUISH_OMEGA * state.squish - 2 * SQUISH_DAMPING * SQUISH_OMEGA * state.squishV) * h;
    state.squish += state.squishV * h;
  }

  state.spin += SPIN * dt;
  rotate(state);
}

/**
 * Scale of the body along x, y, z: a wide flat puddle with no signal, the
 * unit ball when gathered, squashed sideways by kicks.
 */
export function bodyScale(state: FerroState): [number, number, number] {
  const g = state.gather;
  const wide = 1 + 0.5 * (1 - g);
  const tall = 0.14 + 0.86 * g;
  const c = clamp(state.squish, -MAX_SQUISH, MAX_SQUISH);
  return [wide * (1 + c), tall * (1 - 0.75 * c), wide * (1 + 0.25 * c)];
}
