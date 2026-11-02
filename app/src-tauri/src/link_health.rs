//! Detecting a Remote API link that has silently gone dead.
//!
//! When *another* client (OBS, a Stream Deck plugin, a script) calls VBVMR_Logout,
//! every other process's link stops working while each call still reports success:
//! writes return 0 but never reach Voicemeeter, IsParametersDirty returns 0 forever,
//! and the level readings freeze on their last values. A second VBVMR_Login is refused
//! (-2); only Logout + Login revives it.
//!
//! A healthy link echoes every write as a dirty flag within a tick (~33 ms), even a
//! write of the value the parameter already holds, so "a write with no dirty flag
//! after a second" is the dead-link signal. Frozen levels alone are not proof (an
//! audio engine can stall too), so they only trigger a harmless probe write.

use std::time::{Duration, Instant};

/// A write that has not come back as a dirty flag within this long means the link is dead.
pub const WRITE_ECHO_TIMEOUT: Duration = Duration::from_secs(1);
/// Levels bit-identical (and not silent) for this long earn a probe write.
pub const FROZEN_LEVELS_PROBE_AFTER: Duration = Duration::from_secs(3);
/// Re-logging in cuts off other clients the same way, so never do it more often than this.
pub const RELOGIN_COOLDOWN: Duration = Duration::from_secs(10);

/// Whether the oldest unacknowledged write has waited past the echo timeout.
pub fn write_echo_overdue(unacked_since: Option<Instant>, now: Instant) -> bool {
    unacked_since.is_some_and(|t| now.duration_since(t) >= WRITE_ECHO_TIMEOUT)
}

/// Tracks how long the level readings have been bit-identical.
#[derive(Default)]
pub struct FrozenLevels {
    last: Vec<u32>,
    since: Option<Instant>,
}

impl FrozenLevels {
    /// Feed one tick's readings. Returns how long they have been frozen, or `None`
    /// while they move or are all silent (silence is legitimately constant).
    pub fn observe(&mut self, levels: &[f32], now: Instant) -> Option<Duration> {
        let bits: Vec<u32> = levels.iter().map(|l| l.to_bits()).collect();
        if bits != self.last || levels.iter().all(|&l| l == 0.0) {
            self.last = bits;
            self.since = None;
            return None;
        }
        Some(now.duration_since(*self.since.get_or_insert(now)))
    }

    /// Start timing afresh, e.g. after a probe or a re-login.
    pub fn reset(&mut self) {
        self.since = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(start: Instant, ms: u64) -> Instant {
        start + Duration::from_millis(ms)
    }

    #[test]
    fn write_echo_overdue_only_after_timeout() {
        let t0 = Instant::now();
        assert!(!write_echo_overdue(None, at(t0, 5000)));
        assert!(!write_echo_overdue(Some(t0), at(t0, 999)));
        assert!(write_echo_overdue(Some(t0), at(t0, 1000)));
    }

    #[test]
    fn moving_levels_are_never_frozen() {
        let t0 = Instant::now();
        let mut f = FrozenLevels::default();
        for i in 0..100 {
            assert_eq!(f.observe(&[0.01 + i as f32 * 1e-4, 0.02], at(t0, i * 33)), None);
        }
    }

    #[test]
    fn identical_nonzero_levels_freeze_and_count_up() {
        let t0 = Instant::now();
        let mut f = FrozenLevels::default();
        assert_eq!(f.observe(&[0.0037, 0.0044], t0), None);
        assert_eq!(f.observe(&[0.0037, 0.0044], at(t0, 33)), Some(Duration::ZERO));
        assert_eq!(f.observe(&[0.0037, 0.0044], at(t0, 3033)), Some(Duration::from_secs(3)));
    }

    #[test]
    fn silence_is_not_frozen() {
        let t0 = Instant::now();
        let mut f = FrozenLevels::default();
        for i in 0..200 {
            assert_eq!(f.observe(&[0.0, 0.0, 0.0], at(t0, i * 33)), None);
        }
    }

    #[test]
    fn a_change_or_reset_restarts_the_clock() {
        let t0 = Instant::now();
        let mut f = FrozenLevels::default();
        f.observe(&[0.5], t0);
        f.observe(&[0.5], at(t0, 100));
        assert_eq!(f.observe(&[0.6], at(t0, 2000)), None);
        f.observe(&[0.6], at(t0, 2100));
        f.reset();
        assert_eq!(f.observe(&[0.6], at(t0, 4000)), Some(Duration::ZERO));
    }
}
