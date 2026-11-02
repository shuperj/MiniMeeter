export interface ChannelConfig {
  label: string;
  strip: number;
  hasMute: boolean;
  /** Global hotkey to toggle mute (Tauri accelerator format, e.g. "CmdOrCtrl+Shift+M") */
  muteHotkey?: string;
}

export interface A1Device {
  driver: string;
  name: string;
  display: string;
  /** Hardware bus this device is offered for: 0 = A1 (the default), 1 = A2, ... */
  bus?: number;
}

/** Every channel's travel: the full range of Voicemeeter's strip faders. */
export const CHANNEL_MIN_DB = -60;
export const CHANNEL_MAX_DB = 12;

export const DEFAULT_CHANNELS: ChannelConfig[] = [
  { label: "Mic", strip: 0, hasMute: true },
  { label: "VC", strip: 1, hasMute: false },
  { label: "General", strip: 3, hasMute: false },
  { label: "Music", strip: 4, hasMute: false },
];

/** Kept for backwards compat — points to defaults */
export const CHANNELS = DEFAULT_CHANNELS;

export const DEFAULT_A1_CHOICES: A1Device[] = [];

export const DRIVER_OPTIONS = ["asio", "wdm", "ks", "mme"] as const;

export const WHEEL_STEP_DB = 3.0;

/** Default meter decay speed (units/sec) when signal goes silent. ~3s from full to empty. */
export const DEFAULT_METER_DECAY = 0.3;
