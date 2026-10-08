//! Real frequency data for the background visualizers.
//!
//! Captures, read-only, a copy of what apps send to Voicemeeter's input
//! devices (Windows loopback capture on the same render endpoints the
//! per-app mixer uses), so it cannot affect the audio path or its latency.
//! Hardware inputs like a mic aren't included, and like the visualizer level
//! it reads the source before Voicemeeter's faders.
//!
//! A dedicated worker thread owns the COM objects. It sleeps on its command
//! channel until the frontend enables capture (only while a visualizer that
//! uses the spectrum is on screen and animating), then drains each stream
//! and emits `vm:spectrum` (48 log-spaced bands, 0..=255) every ~33 ms.

mod analysis;

use serde::Serialize;
use std::sync::mpsc::{self, Sender};
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, State};

pub const SPECTRUM_EVENT: &str = "vm:spectrum";

#[derive(Clone, Debug, Serialize)]
pub struct SpectrumPayload {
    pub bands: Vec<u8>,
}

enum SpectrumCmd {
    SetEnabled(bool),
}

#[derive(Default)]
pub struct SpectrumHandle {
    tx: Mutex<Option<Sender<SpectrumCmd>>>,
}

impl SpectrumHandle {
    fn sender(&self, app: &AppHandle) -> Result<Sender<SpectrumCmd>, String> {
        let mut guard = self.tx.lock().map_err(|e| e.to_string())?;
        if let Some(tx) = guard.as_ref() {
            return Ok(tx.clone());
        }
        let (tx, rx) = mpsc::channel::<SpectrumCmd>();
        let app = app.clone();
        thread::Builder::new()
            .name("spectrum".into())
            .spawn(move || worker::run(app, rx))
            .map_err(|e| e.to_string())?;
        *guard = Some(tx.clone());
        Ok(tx)
    }
}

/// Start or stop spectrum capture. Stopped, the worker holds no audio
/// clients and blocks on its channel, so it costs nothing.
#[tauri::command]
pub fn vm_set_spectrum_enabled(
    app: AppHandle,
    handle: State<SpectrumHandle>,
    enabled: bool,
) -> Result<(), String> {
    handle
        .sender(&app)?
        .send(SpectrumCmd::SetEnabled(enabled))
        .map_err(|_| "Spectrum worker is gone".to_string())
}

#[cfg(target_os = "windows")]
mod worker {
    use super::analysis::{to_levels, Analyzer, BANDS};
    use super::*;
    use crate::app_sessions::classify_endpoint;
    use std::sync::mpsc::RecvTimeoutError;
    use std::time::{Duration, Instant};
    use tauri::Emitter;
    use windows::core::GUID;
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::Media::Audio::{
        eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator, MMDeviceEnumerator,
        AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
        DEVICE_STATE_ACTIVE, WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
        COINIT_MULTITHREADED, STGM_READ,
    };

    /// Analysis at 60 Hz. Each tick adds up to one tick of delay before a
    /// change in the music reaches the screen, and the FFT is cheap, so this
    /// is as fast as the visualizers can use.
    const TICK: Duration = Duration::from_millis(16);
    /// Minimum gap between endpoint re-scans while running, which pick up
    /// Voicemeeter starting, or recover from a device that went away.
    const RESCAN: Duration = Duration::from_secs(3);
    /// Loopback buffer length, in 100 ns units (100 ms).
    const BUFFER_HNS: i64 = 1_000_000;

    const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
    const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;
    const SUBTYPE_IEEE_FLOAT: GUID = GUID::from_u128(0x00000003_0000_0010_8000_00aa00389b71);

    #[derive(Clone, Copy)]
    enum SampleFormat {
        F32,
        I16,
    }

    struct Stream {
        client: IAudioClient,
        capture: IAudioCaptureClient,
        channels: usize,
        sample_rate: u32,
        format: SampleFormat,
        analyzer: Analyzer,
    }

    impl Drop for Stream {
        fn drop(&mut self) {
            unsafe {
                let _ = self.client.Stop();
            }
        }
    }

    impl Stream {
        /// Pull everything captured since the last call into the analyzer,
        /// down-mixed to mono. Returns the number of frames read.
        fn drain(&mut self) -> windows::core::Result<usize> {
            let mut total = 0;
            unsafe {
                loop {
                    let packet = self.capture.GetNextPacketSize()?;
                    if packet == 0 {
                        break;
                    }
                    let mut data: *mut u8 = std::ptr::null_mut();
                    let mut frames = 0u32;
                    let mut flags = 0u32;
                    self.capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None)?;
                    let n = frames as usize;
                    if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 || data.is_null() {
                        self.analyzer.push_silence(n);
                    } else {
                        let ch = self.channels;
                        let scale = 1.0 / ch as f32;
                        match self.format {
                            SampleFormat::F32 => {
                                let s = std::slice::from_raw_parts(data as *const f32, n * ch);
                                self.analyzer.push(
                                    s.chunks_exact(ch).map(|f| f.iter().sum::<f32>() * scale),
                                );
                            }
                            SampleFormat::I16 => {
                                let s = std::slice::from_raw_parts(data as *const i16, n * ch);
                                self.analyzer.push(s.chunks_exact(ch).map(|f| {
                                    f.iter().map(|&v| v as f32 / 32768.0).sum::<f32>() * scale
                                }));
                            }
                        }
                    }
                    self.capture.ReleaseBuffer(frames)?;
                    total += n;
                }
            }
            Ok(total)
        }
    }

    /// Open a loopback capture stream on every active Voicemeeter input
    /// endpoint. Endpoints that fail to open are skipped.
    fn open_streams(enumerator: &IMMDeviceEnumerator) -> Vec<Stream> {
        let mut streams = Vec::new();
        unsafe {
            let Ok(collection) = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) else {
                return streams;
            };
            let count = collection.GetCount().unwrap_or(0);
            for i in 0..count {
                let Ok(device) = collection.Item(i) else { continue };
                let Ok(store) = device.OpenPropertyStore(STGM_READ) else { continue };
                let name = match store.GetValue(&PKEY_Device_FriendlyName) {
                    Ok(v) => v.to_string(),
                    Err(_) => continue,
                };
                if classify_endpoint(&name).is_none() {
                    continue;
                }
                match open_stream(&device) {
                    Ok(stream) => streams.push(stream),
                    Err(e) => eprintln!("spectrum: can't capture '{name}': {e}"),
                }
            }
        }
        streams
    }

    unsafe fn open_stream(
        device: &windows::Win32::Media::Audio::IMMDevice,
    ) -> Result<Stream, String> {
        let client: IAudioClient = device.Activate(CLSCTX_ALL, None).map_err(|e| e.to_string())?;
        let fmt = client.GetMixFormat().map_err(|e| e.to_string())?;
        // Parse and initialize before freeing the format, then check both.
        let parsed = parse_format(fmt);
        let init = match &parsed {
            Ok(_) => client
                .Initialize(
                    AUDCLNT_SHAREMODE_SHARED,
                    AUDCLNT_STREAMFLAGS_LOOPBACK,
                    BUFFER_HNS,
                    0,
                    fmt,
                    None,
                )
                .map_err(|e| e.to_string()),
            Err(_) => Ok(()),
        };
        CoTaskMemFree(Some(fmt as *const _));
        let (channels, sample_rate, format) = parsed?;
        init?;
        let capture: IAudioCaptureClient = client.GetService().map_err(|e| e.to_string())?;
        client.Start().map_err(|e| e.to_string())?;
        Ok(Stream {
            client,
            capture,
            channels,
            sample_rate,
            format,
            analyzer: Analyzer::new(sample_rate),
        })
    }

    unsafe fn parse_format(fmt: *const WAVEFORMATEX) -> Result<(usize, u32, SampleFormat), String> {
        let f = &*fmt;
        let channels = f.nChannels as usize;
        let tag = f.wFormatTag;
        let bits = f.wBitsPerSample;
        let is_float = tag == WAVE_FORMAT_IEEE_FLOAT
            || (tag == WAVE_FORMAT_EXTENSIBLE && {
                let ext = &*(fmt as *const WAVEFORMATEXTENSIBLE);
                let sub = ext.SubFormat;
                sub == SUBTYPE_IEEE_FLOAT
            });
        let format = match (is_float, bits) {
            (true, 32) => SampleFormat::F32,
            (false, 16) => SampleFormat::I16,
            _ => return Err(format!("unsupported mix format (tag {tag}, {bits} bits)")),
        };
        if channels == 0 {
            return Err("mix format has no channels".into());
        }
        Ok((channels, f.nSamplesPerSec, format))
    }

    #[cfg(test)]
    pub fn live_probe() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let e: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).unwrap();
            let mut streams = open_streams(&e);
            println!("opened {} stream(s)", streams.len());
            for s in &streams {
                println!("  {} ch @ {} Hz", s.channels, s.sample_rate);
            }
            let mut busy = Duration::ZERO;
            for frame in 0..30 {
                std::thread::sleep(TICK);
                let start = Instant::now();
                let mut power = [0.0f32; BANDS];
                let mut frames = 0;
                for s in streams.iter_mut() {
                    frames += s.drain().unwrap_or(0);
                    s.analyzer.add_band_power(&mut power);
                }
                let levels = to_levels(&power);
                busy += start.elapsed();
                if frame % 6 == 5 {
                    println!("frames {frames:5}  bands {:?}", &levels[..]);
                }
            }
            println!("work per frame: {:?} (debug build)", busy / 30);
        }
    }

    pub fn run(app: AppHandle, rx: mpsc::Receiver<SpectrumCmd>) {
        if unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_err() {
            // Nothing to capture with; just swallow commands.
            for _ in rx {}
            return;
        }
        let enumerator: Option<IMMDeviceEnumerator> =
            unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok() };

        let mut enabled = false;
        let mut streams: Vec<Stream> = Vec::new();
        let mut last_scan = Instant::now();
        let mut last_tick = Instant::now();
        let mut rescan = false;

        loop {
            // Disabled: block until told otherwise. Enabled: wake every tick.
            let cmd = if enabled {
                rx.recv_timeout(TICK.saturating_sub(last_tick.elapsed()))
            } else {
                rx.recv().map_err(|_| RecvTimeoutError::Disconnected)
            };
            match cmd {
                Ok(SpectrumCmd::SetEnabled(on)) => {
                    if on && !enabled {
                        if let Some(e) = &enumerator {
                            streams = open_streams(e);
                        }
                        last_scan = Instant::now();
                        last_tick = Instant::now();
                    } else if !on {
                        // Dropping the streams stops capture.
                        streams.clear();
                    }
                    enabled = on;
                    continue;
                }
                Err(RecvTimeoutError::Disconnected) => break,
                Err(RecvTimeoutError::Timeout) => {}
            }

            let elapsed = last_tick.elapsed();
            last_tick = Instant::now();

            // Re-scan only when there's nothing to capture yet (Voicemeeter not
            // running) or a device failed; reopening resets the analyzers.
            if (streams.is_empty() || rescan) && last_scan.elapsed() >= RESCAN {
                if let Some(e) = &enumerator {
                    streams.clear();
                    streams = open_streams(e);
                }
                last_scan = Instant::now();
                rescan = false;
            }

            let mut power = [0.0f32; BANDS];
            let mut failed = false;
            for s in streams.iter_mut() {
                match s.drain() {
                    // Loopback delivers nothing while no app plays; count
                    // that time as silence so the spectrum falls away.
                    Ok(0) => s.analyzer.push_silence(
                        (s.sample_rate as f64 * elapsed.as_secs_f64()) as usize,
                    ),
                    Ok(_) => {}
                    Err(_) => failed = true,
                }
                s.analyzer.add_band_power(&mut power);
            }
            if failed {
                // A device went away (Voicemeeter restarted, edition changed):
                // reopen everything on the next tick.
                rescan = true;
                last_scan = Instant::now() - RESCAN;
            }

            let payload = SpectrumPayload { bands: to_levels(&power).to_vec() };
            let _ = app.emit(SPECTRUM_EVENT, payload);
        }

        streams.clear();
        drop(enumerator);
        unsafe { CoUninitialize() };
    }
}

#[cfg(all(test, target_os = "windows"))]
mod live_tests {
    /// Opens real loopback streams on this machine's Voicemeeter inputs for a
    /// second and prints the bands. Read-only, but needs Voicemeeter running,
    /// so it's opt-in: `cargo test --lib -- --ignored live_capture`.
    #[test]
    #[ignore]
    fn live_capture() {
        worker::live_probe();
    }
    use super::worker;
}

#[cfg(not(target_os = "windows"))]
mod worker {
    use super::*;
    pub fn run(_app: AppHandle, rx: mpsc::Receiver<SpectrumCmd>) {
        for _ in rx {}
    }
}
