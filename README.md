# MiniMeeter

A lightweight, easily resizeable audio mixer for [Voicemeeter Banana](https://vb-audio.com/Voicemeeter/banana.htm) on Windows. Designed to be small enough to sit alongside Plexamp or Spotify, but powerful enough to replace the full Voicemeeter UI for day-to-day mixing.

![License](https://img.shields.io/badge/license-GPL--3.0-blue)

![demo](https://github.com/user-attachments/assets/b0860237-e307-4641-a978-77883a539658)

## Features

- **Compact & resizable** - Starts at 420x340, shrinks down to 200x275 (Plexamp-sized)
- **Windows acrylic glass** - Frosted transparency with your system accent color
- **Live faders** - Smooth dragging, mouse wheel, per-channel mute buttons
- **Real-time sync** - Polls Voicemeeter at ~30fps so hardware changes show up instantly
- **Background visualizers** - 7 animated backgrounds (plasma, starfield, matrix rain, and more)
- **Per-focus styling** - Different backgrounds/opacity when the window is focused vs unfocused
- **A1 output switching** - Change your main output device from the title bar
- **Fully configurable** - Remap strips, rename channels, adjust dB ranges from the settings panel

## Configuring A1 Output Devices

MiniMeeter lets you switch your A1 output device from the title bar dropdown. To set this up, open **Settings > Outputs** and add your devices.

> **The device name must match Voicemeeter exactly.** Open Voicemeeter's own A1 device selector (click "A1" in Voicemeeter's title bar) to see the available devices and their exact names.

<!-- Upload the Voicemeeter A1 device selector screenshot to GitHub and replace this with the image URL -->
<!-- ![Voicemeeter A1 device selector](https://github.com/user-attachments/assets/REPLACE_WITH_UPLOADED_IMAGE_ID) -->

For each device, configure three fields:

| Field | Description | Example |
|-------|-------------|---------|
| **Driver** | The audio driver type | `ASIO`, `MME`, `WDM`, or `KS` |
| **Device name** | Must match the device name shown in Voicemeeter **exactly** | `Focusrite USB ASIO` |
| **Display label** | Friendly name shown in MiniMeeter's dropdown (auto-generated if left blank) | `Focusrite` |

**How to find the correct device name:**

1. In Voicemeeter, click the **A1** button in the top-right corner to open the device selector
2. Select the driver type on the left (WDM, KS, MME, or ASIO)
3. Copy the **exact device name** shown in the list — for example, `Speakers (JBL Quantum TWS)` or `Focusrite USB ASIO`
4. In MiniMeeter Settings > Outputs, select the same driver type and paste the name

If the name doesn't match exactly, the device switch will silently fail.

## Requirements

- Windows 10/11
- [Voicemeeter Banana](https://vb-audio.com/Voicemeeter/banana.htm) installed

## Download

Grab the latest `.exe` from the [Releases](https://github.com/shuperj/MiniMeeter/releases) page.

## Build from Source

You'll need [Node.js](https://nodejs.org/) 20+, [Rust](https://rustup.rs/) (stable, MSVC target), and Visual Studio Build Tools with the C++ workload.

```bash
cd app
npm install
npx tauri build
```

The compiled binary lands in `app/src-tauri/target/release/minimeeter.exe`.

## Support

If you find MiniMeeter useful, consider buying me a coffee:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/shuperj)

## License

[GPL-3.0](LICENSE)
