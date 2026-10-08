//! Turning captured samples into a coarse, log-spaced spectrum.
//!
//! Each capture stream owns an `Analyzer`: a ring of the latest `FFT_SIZE`
//! mono samples. On every visualizer frame it runs one Hann-windowed FFT and
//! adds the power in each of `BANDS` log-spaced bands into a shared total, so
//! several streams (one per Voicemeeter input) mix by summing power. A tiny
//! radix-2 FFT keeps this dependency-free; at 2048 points, 30 times a second,
//! it costs a fraction of a millisecond.

pub const FFT_SIZE: usize = 2048;
pub const BANDS: usize = 48;
const LOW_HZ: f32 = 40.0;
const HIGH_HZ: f32 = 16_000.0;
/// Band power is mapped from this dB range (relative to a full-scale sine)
/// onto 0..=255.
const FLOOR_DB: f32 = -60.0;
const CEIL_DB: f32 = -6.0;
//
// Music falls off toward the treble; tilting the display up this many dB per
// octave (pivoting at 1 kHz) gives every band a fair share of the range.

const TILT_DB_PER_OCTAVE: f32 = 3.0;
const TILT_PIVOT_HZ: f32 = 1_000.0;

pub struct Analyzer {
    ring: Vec<f32>,
    pos: usize,
    window: Vec<f32>,
    /// Inclusive FFT bin range for each band.
    band_bins: Vec<(usize, usize)>,
    fft: Fft,
    re: Vec<f32>,
    im: Vec<f32>,
    /// Samples pushed since the last non-silent one; once a whole window of
    /// silence has passed the FFT is skipped (most inputs are idle).
    since_sound: usize,
}

impl Analyzer {
    pub fn new(sample_rate: u32) -> Self {
        let window = (0..FFT_SIZE)
            .map(|i| {
                let x = (i as f32) / (FFT_SIZE as f32 - 1.0);
                0.5 - 0.5 * (2.0 * std::f32::consts::PI * x).cos()
            })
            .collect();
        Self {
            ring: vec![0.0; FFT_SIZE],
            pos: 0,
            window,
            band_bins: band_bins(sample_rate),
            fft: Fft::new(FFT_SIZE),
            re: vec![0.0; FFT_SIZE],
            im: vec![0.0; FFT_SIZE],
            since_sound: FFT_SIZE,
        }
    }

    pub fn push(&mut self, samples: impl IntoIterator<Item = f32>) {
        for s in samples {
            self.ring[self.pos] = s;
            self.pos = (self.pos + 1) % FFT_SIZE;
            self.since_sound = if s.abs() > 1e-6 { 0 } else { self.since_sound.saturating_add(1) };
        }
    }

    /// Feed `count` samples of silence: used when a stream delivered nothing,
    /// which is what loopback capture does while no app is playing.
    pub fn push_silence(&mut self, count: usize) {
        self.push(std::iter::repeat(0.0).take(count.min(FFT_SIZE)));
    }

    /// Add this stream's power per band into `total`. Power is normalized so
    /// a full-scale sine centered in a band contributes about 1.0 there.
    pub fn add_band_power(&mut self, total: &mut [f32; BANDS]) {
        if self.since_sound >= FFT_SIZE {
            return;
        }
        for i in 0..FFT_SIZE {
            // Oldest sample first.
            let s = self.ring[(self.pos + i) % FFT_SIZE];
            self.re[i] = s * self.window[i];
            self.im[i] = 0.0;
        }
        self.fft.run(&mut self.re, &mut self.im);

        // A full-scale sine through a Hann window peaks at N/4.
        let norm = 4.0 / FFT_SIZE as f32;
        for (band, &(lo, hi)) in self.band_bins.iter().enumerate() {
            let mut peak = 0.0f32;
            for bin in lo..=hi {
                let p = (self.re[bin] * self.re[bin] + self.im[bin] * self.im[bin]) * norm * norm;
                peak = peak.max(p);
            }
            total[band] += peak;
        }
    }
}

/// Band power to 0..=255 on a dB scale, with the treble tilt applied.
pub fn to_levels(power: &[f32; BANDS]) -> [u8; BANDS] {
    let mut out = [0u8; BANDS];
    for (b, (o, &p)) in out.iter_mut().zip(power).enumerate() {
        if p <= 0.0 {
            continue;
        }
        let db = 10.0 * p.log10() + TILT_DB_PER_OCTAVE * (band_center_hz(b) / TILT_PIVOT_HZ).log2();
        let t = ((db - FLOOR_DB) / (CEIL_DB - FLOOR_DB)).clamp(0.0, 1.0);
        *o = (t * 255.0).round() as u8;
    }
    out
}

/// Geometric center frequency of a band.
fn band_center_hz(band: usize) -> f32 {
    LOW_HZ * (HIGH_HZ / LOW_HZ).powf((band as f32 + 0.5) / BANDS as f32)
}

/// Log-spaced band edges mapped to FFT bins. Low bands are narrower than one
/// bin at this FFT size, so they fall back to the single nearest bin.
fn band_bins(sample_rate: u32) -> Vec<(usize, usize)> {
    let bin_hz = sample_rate as f32 / FFT_SIZE as f32;
    let max_bin = FFT_SIZE / 2 - 1;
    let ratio = HIGH_HZ / LOW_HZ;
    (0..BANDS)
        .map(|b| {
            let f0 = LOW_HZ * ratio.powf(b as f32 / BANDS as f32);
            let f1 = LOW_HZ * ratio.powf((b + 1) as f32 / BANDS as f32);
            let lo = (f0 / bin_hz).ceil() as usize;
            let hi = (f1 / bin_hz).floor() as usize;
            if lo <= hi {
                (lo.clamp(1, max_bin), hi.clamp(1, max_bin))
            } else {
                let center = ((f0 * f1).sqrt() / bin_hz).round() as usize;
                let c = center.clamp(1, max_bin);
                (c, c)
            }
        })
        .collect()
}

/// In-place iterative radix-2 complex FFT with precomputed twiddles.
struct Fft {
    n: usize,
    cos: Vec<f32>,
    sin: Vec<f32>,
    rev: Vec<usize>,
}

impl Fft {
    fn new(n: usize) -> Self {
        assert!(n.is_power_of_two());
        let bits = n.trailing_zeros();
        let rev = (0..n).map(|i| i.reverse_bits() >> (usize::BITS - bits)).collect();
        let (cos, sin) = (0..n / 2)
            .map(|k| {
                let a = -2.0 * std::f64::consts::PI * k as f64 / n as f64;
                (a.cos() as f32, a.sin() as f32)
            })
            .unzip();
        Self { n, cos, sin, rev }
    }

    fn run(&self, re: &mut [f32], im: &mut [f32]) {
        for i in 0..self.n {
            let j = self.rev[i];
            if i < j {
                re.swap(i, j);
                im.swap(i, j);
            }
        }
        let mut size = 2;
        while size <= self.n {
            let half = size / 2;
            let step = self.n / size;
            for start in (0..self.n).step_by(size) {
                for k in 0..half {
                    let (c, s) = (self.cos[k * step], self.sin[k * step]);
                    let (a, b) = (start + k, start + k + half);
                    let tr = re[b] * c - im[b] * s;
                    let ti = re[b] * s + im[b] * c;
                    re[b] = re[a] - tr;
                    im[b] = im[a] - ti;
                    re[a] += tr;
                    im[a] += ti;
                }
            }
            size *= 2;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(freq: f32, sr: u32, amp: f32, n: usize) -> impl Iterator<Item = f32> {
        (0..n).map(move |i| amp * (2.0 * std::f32::consts::PI * freq * i as f32 / sr as f32).sin())
    }

    fn band_of(freq: f32) -> usize {
        let t = (freq / LOW_HZ).ln() / (HIGH_HZ / LOW_HZ).ln();
        ((t * BANDS as f32) as usize).min(BANDS - 1)
    }

    #[test]
    fn fft_matches_a_naive_dft() {
        let n = 64;
        let fft = Fft::new(n);
        let input: Vec<f32> = (0..n).map(|i| ((i * 7 % 13) as f32 - 6.0) / 6.0).collect();
        let (mut re, mut im) = (input.clone(), vec![0.0; n]);
        fft.run(&mut re, &mut im);
        for k in 0..n {
            let (mut dr, mut di) = (0.0f64, 0.0f64);
            for (t, &x) in input.iter().enumerate() {
                let a = -2.0 * std::f64::consts::PI * (k * t) as f64 / n as f64;
                dr += x as f64 * a.cos();
                di += x as f64 * a.sin();
            }
            assert!((re[k] as f64 - dr).abs() < 1e-3, "re[{k}]");
            assert!((im[k] as f64 - di).abs() < 1e-3, "im[{k}]");
        }
    }

    #[test]
    fn a_tone_lights_up_its_own_band() {
        let mut a = Analyzer::new(48_000);
        a.push(sine(1_000.0, 48_000, 0.5, FFT_SIZE));
        let mut power = [0.0; BANDS];
        a.add_band_power(&mut power);
        let levels = to_levels(&power);
        let target = band_of(1_000.0);
        let loudest = (0..BANDS).max_by_key(|&b| levels[b]).unwrap();
        assert!(loudest.abs_diff(target) <= 1, "loudest band {loudest}, expected ~{target}");
        // Far-away bands stay dark.
        assert!(levels[band_of(100.0)] < 40);
        assert!(levels[band_of(10_000.0)] < 40);
    }

    #[test]
    fn a_full_scale_tone_reads_near_the_top() {
        let mut a = Analyzer::new(48_000);
        a.push(sine(2_000.0, 48_000, 1.0, FFT_SIZE));
        let mut power = [0.0; BANDS];
        a.add_band_power(&mut power);
        assert!(to_levels(&power)[band_of(2_000.0)] > 230);
    }

    #[test]
    fn silence_reads_zero() {
        let mut a = Analyzer::new(44_100);
        a.push(sine(500.0, 44_100, 0.8, FFT_SIZE));
        a.push_silence(FFT_SIZE);
        let mut power = [0.0; BANDS];
        a.add_band_power(&mut power);
        assert!(to_levels(&power).iter().all(|&l| l == 0));
    }

    #[test]
    fn skips_work_once_a_stream_goes_quiet() {
        let mut a = Analyzer::new(48_000);
        a.push(sine(500.0, 48_000, 0.8, 100));
        a.push_silence(FFT_SIZE);
        let mut power = [0.0; BANDS];
        a.add_band_power(&mut power);
        assert!(power.iter().all(|&p| p == 0.0));
    }

    #[test]
    fn tilt_lifts_treble_relative_to_bass() {
        let mut power = [0.0; BANDS];
        power[2] = 0.01;
        power[BANDS - 3] = 0.01;
        let levels = to_levels(&power);
        assert!(levels[BANDS - 3] > levels[2]);
    }

    #[test]
    fn every_band_maps_to_real_bins_in_order() {
        for sr in [44_100, 48_000, 96_000] {
            let bins = band_bins(sr);
            assert_eq!(bins.len(), BANDS);
            for w in bins.windows(2) {
                assert!(w[0].0 <= w[1].0, "{sr}: bands out of order");
            }
            assert!(bins.iter().all(|&(lo, hi)| lo >= 1 && lo <= hi && hi < FFT_SIZE / 2));
        }
    }
}
