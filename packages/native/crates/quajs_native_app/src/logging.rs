//! Leveled diagnostics for the native app.
//!
//! Output always goes to **stderr**: the dev launcher parses the host-info
//! JSON line from stdout, so anything written there would break startup.
//!
//! Runtime level comes from `QUA_NATIVE_LOG`:
//!
//! ```text
//! QUA_NATIVE_LOG=debug                        # everything at debug
//! QUA_NATIVE_LOG=warn,quajs_native_app=trace  # global warn, one target louder
//! ```
//!
//! Defaults to `info`, with `wgpu`/`winit`/`naga` pinned to `warn` so their
//! internal chatter does not drown the app's own lines. In release builds the
//! `native-log-strip-release` feature compiles `debug!`/`trace!` out entirely.
//!
//! Levels are ANSI-colored when stderr is a terminal. Colors are disabled by
//! `NO_COLOR` or a `dumb` terminal, and can be forced with
//! `QUA_NATIVE_LOG_COLOR=always|never|auto` (default `auto`).

use std::io::{IsTerminal, Write};
use std::time::Instant;

use log::{Level, LevelFilter, Log, Metadata, Record, SetLoggerError};

const LOG_ENV: &str = "QUA_NATIVE_LOG";
const LOG_COLOR_ENV: &str = "QUA_NATIVE_LOG_COLOR";
const DEFAULT_LEVEL: LevelFilter = LevelFilter::Info;

/// Third-party targets that are noisy at `debug`/`trace` and rarely what we
/// are debugging. An explicit `QUA_NATIVE_LOG` entry still wins over these.
const NOISY_TARGET_DEFAULTS: &[(&str, LevelFilter)] = &[
    ("wgpu", LevelFilter::Warn),
    ("wgpu_core", LevelFilter::Warn),
    ("wgpu_hal", LevelFilter::Warn),
    ("winit", LevelFilter::Warn),
    ("naga", LevelFilter::Warn),
];

struct NativeLogger {
    global: LevelFilter,
    targets: Vec<(String, LevelFilter)>,
    started_at: Instant,
    color: bool,
}

impl NativeLogger {
    fn level_for(&self, target: &str) -> LevelFilter {
        // Longest prefix wins, so `quajs_native_app::font_backend` beats a
        // bare `quajs_native_app` entry.
        self.targets
            .iter()
            .filter(|(prefix, _)| target_matches(target, prefix))
            .max_by_key(|(prefix, _)| prefix.len())
            .map(|(_, level)| *level)
            .unwrap_or(self.global)
    }
}

/// `a::b` matches prefix `a` and `a::b`, but not `ab`.
fn target_matches(target: &str, prefix: &str) -> bool {
    target == prefix
        || target
            .strip_prefix(prefix)
            .is_some_and(|rest| rest.starts_with("::"))
}

/// ANSI color per level: errors red, warnings yellow, info green, debug blue,
/// trace magenta. The level tag is the loudest element on the line so the eye
/// can scan for severity; timestamp and target stay dim/cyan secondary.
fn level_color(level: Level) -> &'static str {
    match level {
        Level::Error => "\x1b[1;31m",
        Level::Warn => "\x1b[1;33m",
        Level::Info => "\x1b[32m",
        Level::Debug => "\x1b[34m",
        Level::Trace => "\x1b[35m",
    }
}

/// Color is on when stderr is a terminal, unless `NO_COLOR` is set or the
/// terminal is `dumb`. `QUA_NATIVE_LOG_COLOR=always|never|auto` overrides
/// detection so colors can be forced through pipes or stripped on terminals.
fn colors_enabled() -> bool {
    match std::env::var(LOG_COLOR_ENV)
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "always" | "on" | "1" | "true" => return true,
        "never" | "off" | "0" | "false" => return false,
        _ => {}
    }
    if std::env::var_os("NO_COLOR").is_some() {
        return false;
    }
    if std::env::var("TERM").is_ok_and(|term| term == "dumb") {
        return false;
    }
    std::io::stderr().is_terminal()
}

impl Log for NativeLogger {
    fn enabled(&self, metadata: &Metadata<'_>) -> bool {
        metadata.level() <= self.level_for(metadata.target())
    }

    fn log(&self, record: &Record<'_>) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let elapsed = self.started_at.elapsed();
        let mut stderr = std::io::stderr().lock();
        if self.color {
            let _ = writeln!(
                stderr,
                "\x1b[2m[{:>7.3}s\x1b[0m {}{:<5}\x1b[0m \x1b[36m{}\x1b[0m\x1b[2m]\x1b[0m {}",
                elapsed.as_secs_f64(),
                level_color(record.level()),
                record.level(),
                record.target(),
                record.args()
            );
        } else {
            let _ = writeln!(
                stderr,
                "[{:>7.3}s {:<5} {}] {}",
                elapsed.as_secs_f64(),
                record.level(),
                record.target(),
                record.args()
            );
        }
    }

    fn flush(&self) {
        let _ = std::io::stderr().lock().flush();
    }
}

/// Installs the logger. Safe to call once; later calls return an error that
/// callers are expected to ignore (tests may install their own logger).
pub(crate) fn init_native_logging() -> Result<(), SetLoggerError> {
    let spec = std::env::var(LOG_ENV).unwrap_or_default();
    let (global, mut targets) = parse_log_spec(&spec);
    for (target, level) in NOISY_TARGET_DEFAULTS {
        if !targets.iter().any(|(prefix, _)| prefix == target) {
            targets.push(((*target).to_string(), *level));
        }
    }
    let max_level = targets
        .iter()
        .map(|(_, level)| *level)
        .chain(std::iter::once(global))
        .max()
        .unwrap_or(DEFAULT_LEVEL);

    let logger = Box::leak(Box::new(NativeLogger {
        global,
        targets,
        started_at: Instant::now(),
        color: colors_enabled(),
    }));
    log::set_logger(logger)?;
    log::set_max_level(max_level);
    log::debug!(
        "native logging initialized: spec={:?} global={global} max={max_level}",
        if spec.is_empty() { "<default>" } else { &spec }
    );
    Ok(())
}

/// `"debug"` → global debug. `"warn,foo=trace"` → global warn, `foo` at trace.
/// Unparsable entries are skipped rather than failing startup.
fn parse_log_spec(spec: &str) -> (LevelFilter, Vec<(String, LevelFilter)>) {
    let mut global = DEFAULT_LEVEL;
    let mut targets = Vec::new();
    for entry in spec.split(',') {
        let entry = entry.trim();
        if entry.is_empty() {
            continue;
        }
        match entry.split_once('=') {
            Some((target, level)) => {
                let target = target.trim();
                if let (false, Some(level)) = (target.is_empty(), parse_level(level)) {
                    targets.push((target.to_string(), level));
                }
            }
            None => {
                if let Some(level) = parse_level(entry) {
                    global = level;
                }
            }
        }
    }
    (global, targets)
}

fn parse_level(value: &str) -> Option<LevelFilter> {
    match value.trim().to_ascii_lowercase().as_str() {
        "off" => Some(LevelFilter::Off),
        "error" => Some(LevelFilter::Error),
        "warn" | "warning" => Some(LevelFilter::Warn),
        "info" => Some(LevelFilter::Info),
        "debug" => Some(LevelFilter::Debug),
        "trace" => Some(LevelFilter::Trace),
        _ => None,
    }
}

/// Formats an error chain as `outer: inner: root` for single-line logging.
pub(crate) fn error_chain(error: &dyn std::error::Error) -> String {
    let mut message = error.to_string();
    let mut source = error.source();
    while let Some(current) = source {
        message.push_str(": ");
        message.push_str(&current.to_string());
        source = current.source();
    }
    message
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_global_level_and_per_target_overrides() {
        let (global, targets) = parse_log_spec("warn,quajs_native_app=trace,wgpu=error");
        assert_eq!(global, LevelFilter::Warn);
        assert_eq!(
            targets,
            vec![
                ("quajs_native_app".to_string(), LevelFilter::Trace),
                ("wgpu".to_string(), LevelFilter::Error),
            ]
        );
    }

    #[test]
    fn defaults_to_info_and_skips_unparsable_entries() {
        let (global, targets) = parse_log_spec("");
        assert_eq!(global, DEFAULT_LEVEL);
        assert!(targets.is_empty());

        let (global, targets) = parse_log_spec("nonsense,=trace,foo=nonsense");
        assert_eq!(global, DEFAULT_LEVEL);
        assert!(targets.is_empty());
    }

    #[test]
    fn resolves_target_levels_by_longest_matching_prefix() {
        let logger = NativeLogger {
            global: LevelFilter::Info,
            targets: vec![
                ("quajs_native_app".to_string(), LevelFilter::Warn),
                (
                    "quajs_native_app::font_backend".to_string(),
                    LevelFilter::Trace,
                ),
            ],
            started_at: Instant::now(),
            color: false,
        };

        assert_eq!(
            logger.level_for("quajs_native_app::font_backend"),
            LevelFilter::Trace
        );
        assert_eq!(
            logger.level_for("quajs_native_app::window_smoke"),
            LevelFilter::Warn
        );
        assert_eq!(logger.level_for("other_crate"), LevelFilter::Info);
        // A prefix must end on a module boundary.
        assert_eq!(logger.level_for("quajs_native_apples"), LevelFilter::Info);
    }

    #[test]
    fn formats_nested_error_sources_on_one_line() {
        #[derive(Debug)]
        struct Inner;
        impl std::fmt::Display for Inner {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(f, "root cause")
            }
        }
        impl std::error::Error for Inner {}

        #[derive(Debug)]
        struct Outer(Inner);
        impl std::fmt::Display for Outer {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(f, "outer failure")
            }
        }
        impl std::error::Error for Outer {
            fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
                Some(&self.0)
            }
        }

        assert_eq!(error_chain(&Outer(Inner)), "outer failure: root cause");
    }
}
