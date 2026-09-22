//! Always-on resource policy, independent of the optional editor telemetry lease.
//! OS sampling runs off the render thread, including while the game is idle.
use std::{
    sync::{mpsc, Arc, Mutex},
    thread::JoinHandle,
    time::{Duration, Instant},
};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

const MIB: u64 = 1024 * 1024;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(super) struct ImageBudget {
    pub cache: usize,
    pub preparation: usize,
}

#[derive(Clone, Copy, Debug)]
struct MemorySample {
    total: u64,
    available: u64,
    process: u64,
    pressure: bool,
}

impl MemorySample {
    fn budget(self) -> ImageBudget {
        if self.total == 0 || self.available > self.total || self.process == 0 || self.pressure {
            return ImageBudget::default();
        }
        // Protect the OS/other apps, and leave half of our remaining allowance
        // for untracked growth (JS, QPKs, audio, fonts, GPU driver allocations).
        let system_reserve = (self.total / 10).max(256 * MIB);
        let process_target = (self.total / 4).min(2048 * MIB);
        let allowance = self
            .available
            .saturating_sub(system_reserve)
            .min(process_target.saturating_sub(self.process));
        // The combined allowance covers retained textures AND one preparation
        // peak. Keeping these separate lets the next 4K image prepare while the
        // previous one is still visible, without hiding temporary allocations.
        let bytes = (self.total / 16).min(512 * MIB).min(allowance / 2);
        let bytes = if bytes < 16 * MIB {
            0
        } else {
            (bytes / (8 * MIB) * (8 * MIB)) as usize
        };
        ImageBudget {
            cache: bytes / 2,
            preparation: bytes / 2,
        }
    }
}

#[derive(Default)]
struct BudgetRecovery {
    current: ImageBudget,
    initialized: bool,
    healthy_samples: u8,
}
impl BudgetRecovery {
    fn update(&mut self, target: ImageBudget) -> ImageBudget {
        if !self.initialized || target.cache < self.current.cache {
            self.current = target;
            self.healthy_samples = 0;
        } else if target.cache > self.current.cache {
            self.healthy_samples = self.healthy_samples.saturating_add(1);
            if self.healthy_samples >= 3 {
                let bytes = target
                    .cache
                    .min(self.current.cache.saturating_add(32 * MIB as usize));
                self.current = ImageBudget {
                    cache: bytes,
                    preparation: bytes,
                };
            }
        } else {
            self.healthy_samples = 0;
        }
        self.initialized = true;
        self.current
    }
}

#[derive(Default)]
pub(super) struct MemoryBudgetMonitor {
    latest: Arc<Mutex<Option<(Instant, ImageBudget)>>>,
    stop: Option<mpsc::Sender<()>>,
    worker: Option<JoinHandle<()>>,
    last_read: Option<(Instant, ImageBudget)>,
}
impl MemoryBudgetMonitor {
    pub fn start(wake: impl Fn() + Send + 'static) -> Self {
        let mut monitor = Self::default();
        let latest = monitor.latest.clone();
        let (stop, receiver) = mpsc::channel();
        let worker = std::thread::Builder::new().name("qua-memory-budget".into()).spawn(move || {
            let mut system = System::new();
            let mut policy = BudgetRecovery::default();
            loop {
                let sample = sample_memory(&mut system);
                let previous = policy.current;
                let budget = policy.update(sample.map_or(ImageBudget::default(), MemorySample::budget));
                if previous != budget {
                    log::debug!("Image memory budget: cache={} MiB preparation={} MiB sample={sample:?}",
                        budget.cache / MIB as usize, budget.preparation / MIB as usize);
                }
                *latest.lock().unwrap_or_else(|e| e.into_inner()) = Some((Instant::now(), budget));
                wake();
                if receiver.recv_timeout(Duration::from_secs(1)) != Err(mpsc::RecvTimeoutError::Timeout) { break; }
            }
        });
        match worker {
            Ok(worker) => {
                monitor.worker = Some(worker);
                monitor.stop = Some(stop);
            }
            Err(error) => {
                log::warn!("Memory monitor unavailable; image prewarming disabled: {error}")
            }
        }
        monitor
    }
    pub fn budget(&mut self) -> ImageBudget {
        if let Ok(latest) = self.latest.try_lock() {
            self.last_read = *latest;
        }
        self.last_read
            .filter(|(at, _)| at.elapsed() < Duration::from_secs(3))
            .map_or(ImageBudget::default(), |(_, budget)| budget)
    }
}
impl Drop for MemoryBudgetMonitor {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn sample_memory(system: &mut System) -> Option<MemorySample> {
    system.refresh_memory();
    let pid = Pid::from_u32(std::process::id());
    system.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[pid]),
        true,
        ProcessRefreshKind::nothing().with_memory(),
    );
    let resident = system.process(pid)?.memory();
    let (footprint, pressure) = platform_pressure();
    Some(MemorySample {
        total: system.total_memory(),
        available: system.available_memory(),
        process: resident.max(footprint.unwrap_or(0)),
        pressure,
    })
}

#[cfg(not(target_os = "macos"))]
fn platform_pressure() -> (Option<u64>, bool) {
    (None, false)
}

#[cfg(target_os = "macos")]
fn platform_pressure() -> (Option<u64>, bool) {
    use std::ffi::{c_char, c_void};
    // Darwin sys/resource.h rusage_info_v0: UUID followed by ten u64 counters.
    // ri_phys_footprint is counter 7 and includes compressed/charged process memory.
    #[repr(C)]
    #[derive(Default)]
    struct RusageInfoV0 {
        uuid: [u8; 16],
        counters: [u64; 10],
    }
    unsafe extern "C" {
        fn proc_pid_rusage(pid: i32, flavor: i32, buffer: *mut c_void) -> i32;
        fn sysctlbyname(
            name: *const c_char,
            old: *mut c_void,
            len: *mut usize,
            new: *mut c_void,
            new_len: usize,
        ) -> i32;
    }
    let mut usage = RusageInfoV0::default();
    let mut pressure: i32 = 0;
    let mut size = std::mem::size_of_val(&pressure);
    // Both OS calls write only to correctly sized, stack-owned buffers.
    unsafe {
        let footprint = (proc_pid_rusage(
            std::process::id() as i32,
            0,
            (&mut usage as *mut RusageInfoV0).cast(),
        ) == 0)
            .then_some(usage.counters[7]);
        let ok = sysctlbyname(
            c"kern.memorystatus_vm_pressure_level".as_ptr(),
            (&mut pressure as *mut i32).cast(),
            &mut size,
            std::ptr::null_mut(),
            0,
        ) == 0;
        (footprint, ok && pressure > 1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample(total: u64, available: u64, process: u64) -> MemorySample {
        MemorySample {
            total: total * MIB,
            available: available * MIB,
            process: process * MIB,
            pressure: false,
        }
    }
    #[test]
    fn memory_budget_accounts_for_whole_process_and_system_headroom() {
        assert_eq!(sample(16384, 8192, 500).budget().cache, 256 * MIB as usize);
        assert_eq!(sample(2048, 1024, 200).budget().cache, 64 * MIB as usize);
        assert_eq!(sample(2048, 400, 450).budget().cache, 12 * MIB as usize);
        assert_eq!(sample(16384, 8192, 2100).budget(), ImageBudget::default());
        assert_eq!(sample(8192, 300, 400).budget(), ImageBudget::default());
        assert_eq!(
            MemorySample {
                pressure: true,
                ..sample(16384, 8192, 400)
            }
            .budget(),
            ImageBudget::default()
        );
        assert_eq!(sample(0, 0, 0).budget(), ImageBudget::default());
    }
    #[test]
    fn memory_budget_shrinks_immediately_and_recovers_after_sustained_headroom() {
        let full = sample(16384, 8192, 500).budget();
        let mut policy = BudgetRecovery::default();
        assert_eq!(policy.update(full), full);
        assert_eq!(policy.update(ImageBudget::default()).cache, 0);
        for _ in 0..2 {
            assert_eq!(policy.update(full).cache, 0);
        }
        assert_eq!(policy.update(full).cache, 32 * MIB as usize);
        assert_eq!(policy.update(ImageBudget::default()).cache, 0);
        assert_eq!(policy.update(full).cache, 0);
    }
    #[test]
    fn memory_budget_unknown_and_stale_samples_disable_prewarming() {
        let mut monitor = MemoryBudgetMonitor::default();
        assert_eq!(monitor.budget().cache, 0);
        *monitor.latest.lock().unwrap() = Some((
            Instant::now() - Duration::from_secs(4),
            sample(16384, 8192, 500).budget(),
        ));
        assert_eq!(monitor.budget().cache, 0);
    }
    #[test]
    fn memory_budget_live_os_sample_is_valid() {
        let memory = sample_memory(&mut System::new()).expect("self process memory");
        eprintln!(
            "Live memory policy sample: {memory:?}; budget={:?}",
            memory.budget()
        );
        assert!(memory.total > 0 && memory.process > 0 && memory.available <= memory.total);
        #[cfg(target_os = "macos")]
        assert!(platform_pressure().0.is_some_and(|bytes| bytes > 0));
    }
}
