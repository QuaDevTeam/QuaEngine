//! Read-only development telemetry. Sampling never wakes or requests a frame.
//! The two-second lease bounds work if the editor disconnects without cleanup.
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    sync::Mutex,
    time::{Duration, Instant},
};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

#[derive(Default)]
struct Frames {
    lease: Option<Instant>,
    started: Option<Instant>,
    times: VecDeque<Instant>,
    previous_count: Option<usize>,
    last_frame: Option<Instant>,
    frame_ms: Option<f64>,
    draw_calls: Option<u64>,
    passes: Option<usize>,
    gpu_bytes: Option<u64>,
    gpu_at: Option<Instant>,
}
#[derive(Default)]
struct ProcessSample {
    system: Option<System>,
    at: Option<Instant>,
    cpu: Option<f32>,
    memory: Option<u64>,
    gpu: Option<f64>,
}
#[derive(Default)]
pub(super) struct PerformanceMonitor {
    frames: Mutex<Frames>,
    process: Mutex<ProcessSample>,
}
impl PerformanceMonitor {
    pub(super) fn record(
        &self,
        count: usize,
        frame_ms: f64,
        draw_calls: u64,
        passes: usize,
        gpu_bytes: impl FnOnce() -> Option<u64>,
    ) {
        let Ok(mut frames) = self.frames.try_lock() else {
            return;
        };
        let now = Instant::now();
        if !frames
            .lease
            .is_some_and(|at| now.duration_since(at) < Duration::from_secs(2))
        {
            return;
        }
        if frames.previous_count != Some(count) {
            // Recover intervening submissions if a snapshot lock briefly made
            // record() skip a frame. Device recovery may reset the loop counter.
            let added = frames
                .previous_count
                .map(|previous| count.saturating_sub(previous).max(1))
                .unwrap_or(1)
                .min(512);
            frames.previous_count = Some(count);
            for _ in 0..added {
                if frames.times.len() == 512 {
                    frames.times.pop_front();
                }
                frames.times.push_back(now);
            }
            frames.last_frame = Some(now);
            frames.frame_ms = Some(frame_ms);
            frames.draw_calls = Some(draw_calls);
            frames.passes = Some(passes);
            if frames
                .gpu_at
                .is_none_or(|at| now.duration_since(at) >= Duration::from_millis(180))
            {
                frames.gpu_bytes = gpu_bytes();
                frames.gpu_at = Some(now);
            }
        }
    }

    pub(super) fn sample(&self, enabled: bool) -> Value {
        let now = Instant::now();
        let mut frames = self.frames.lock().unwrap_or_else(|e| e.into_inner());
        if !enabled {
            *frames = Frames::default();
            drop(frames);
            *self.process.lock().unwrap_or_else(|e| e.into_inner()) = ProcessSample::default();
            return json!({});
        }
        if !frames
            .lease
            .is_some_and(|at| now.duration_since(at) < Duration::from_secs(2))
        {
            *frames = Frames {
                started: Some(now),
                ..Default::default()
            };
        }
        frames.lease = Some(now);
        while frames
            .times
            .front()
            .is_some_and(|at| now.duration_since(*at) > Duration::from_secs(1))
        {
            frames.times.pop_front();
        }
        let duration = now
            .duration_since(frames.started.unwrap_or(now))
            .as_secs_f64()
            .min(1.0);
        let fps = (duration >= 0.5).then(|| frames.times.len() as f64 / duration);
        let mut result = json!({
            "fps": fps, "frameMs": frames.frame_ms, "drawCalls": frames.draw_calls,
            "renderPasses": frames.passes, "gpuMemoryBytes": frames.gpu_bytes,
            "frameAgeMs": frames.last_frame.map(|at| now.duration_since(at).as_secs_f64() * 1000.0),
        });
        drop(frames);
        let mut process = self.process.lock().unwrap_or_else(|e| e.into_inner());
        if process
            .at
            .is_none_or(|at| now.duration_since(at) >= Duration::from_millis(180))
        {
            let warmed = process
                .at
                .is_some_and(|at| now.duration_since(at) < Duration::from_secs(2));
            let pid = Pid::from_u32(std::process::id());
            let system = process.system.get_or_insert_with(System::new);
            system.refresh_processes_specifics(
                ProcessesToUpdate::Some(&[pid]),
                true,
                ProcessRefreshKind::nothing().with_cpu().with_memory(),
            );
            let (cpu, memory) = system
                .process(pid)
                .map(|p| (warmed.then(|| p.cpu_usage()), Some(p.memory())))
                .unwrap_or_default();
            process.cpu = cpu;
            process.memory = memory;
            process.gpu = gpu_utilization();
            process.at = Some(now);
        }
        result["cpuPercent"] = json!(process.cpu);
        result["memoryBytes"] = json!(process.memory);
        result["gpuPercent"] = json!(process.gpu);
        result["gpuMemorySource"] = json!(if cfg!(target_os = "macos") {
            "Metal 设备分配（Apple Silicon 为统一内存）"
        } else {
            "GPU 分配器"
        });
        result["gpuSource"] = json!(if cfg!(target_os = "macos") {
            "系统 GPU · IOAccelerator"
        } else {
            "驱动未提供利用率"
        });
        result
    }
}

#[cfg(not(target_os = "macos"))]
fn gpu_utilization() -> Option<f64> {
    None
}

// Read the same driver counters used by IORegistry tools, without launching
// a subprocess or copying the entire registry. No CoreFoundation handles escape.
#[cfg(target_os = "macos")]
fn gpu_utilization() -> Option<f64> {
    use std::ffi::{c_char, c_void};
    type Ref = *const c_void;
    #[link(name = "IOKit", kind = "framework")]
    unsafe extern "C" {
        fn IOServiceMatching(name: *const c_char) -> *mut c_void;
        fn IOServiceGetMatchingServices(
            port: u32,
            matching: *mut c_void,
            iterator: *mut u32,
        ) -> i32;
        fn IOIteratorNext(iterator: u32) -> u32;
        fn IOObjectRelease(object: u32) -> i32;
        fn IORegistryEntryCreateCFProperty(
            entry: u32,
            key: Ref,
            allocator: Ref,
            options: u32,
        ) -> Ref;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFStringCreateWithCString(allocator: Ref, text: *const c_char, encoding: u32) -> Ref;
        fn CFDictionaryGetValue(dictionary: Ref, key: Ref) -> Ref;
        fn CFGetTypeID(value: Ref) -> usize;
        fn CFDictionaryGetTypeID() -> usize;
        fn CFNumberGetTypeID() -> usize;
        fn CFNumberGetValue(number: Ref, kind: isize, value: *mut c_void) -> bool;
        fn CFRelease(value: Ref);
    }
    unsafe {
        let mut iterator = 0;
        let matching = IOServiceMatching(c"IOAccelerator".as_ptr());
        if matching.is_null() || IOServiceGetMatchingServices(0, matching, &mut iterator) != 0 {
            return None;
        }
        let key = CFStringCreateWithCString(
            std::ptr::null(),
            c"PerformanceStatistics".as_ptr(),
            0x08000100,
        );
        let utilization = CFStringCreateWithCString(
            std::ptr::null(),
            c"Device Utilization %".as_ptr(),
            0x08000100,
        );
        let mut result: Option<f64> = None;
        loop {
            let service = IOIteratorNext(iterator);
            if service == 0 {
                break;
            }
            let stats = IORegistryEntryCreateCFProperty(service, key, std::ptr::null(), 0);
            if !stats.is_null() {
                if CFGetTypeID(stats) == CFDictionaryGetTypeID() {
                    let value = CFDictionaryGetValue(stats, utilization);
                    let mut percent = 0_f64;
                    if !value.is_null()
                        && CFGetTypeID(value) == CFNumberGetTypeID()
                        && CFNumberGetValue(value, 6, (&mut percent as *mut f64).cast())
                        && percent.is_finite()
                    {
                        result = Some(result.unwrap_or_default().max(percent.clamp(0.0, 100.0)));
                    }
                }
                CFRelease(stats);
            }
            IOObjectRelease(service);
        }
        CFRelease(key);
        CFRelease(utilization);
        IOObjectRelease(iterator);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn performance_lease_bounds_work_and_does_not_fabricate_idle_frames() {
        let monitor = PerformanceMonitor::default();
        monitor.record(1, 2.0, 5, 1, || panic!("hidden monitor must not query GPU"));
        assert!(monitor.sample(true)["fps"].is_null());
        monitor.record(2, 3.0, 9, 2, || Some(123));
        monitor.record(2, 3.0, 9, 2, || panic!("duplicate frame"));
        let sample = monitor.sample(true);
        assert_eq!(sample["drawCalls"], 9);
        assert_eq!(sample["gpuMemoryBytes"], 123);
        assert_eq!(monitor.frames.lock().unwrap().times.len(), 1);
        monitor.record(5, 3.0, 9, 2, || Some(123));
        assert_eq!(monitor.frames.lock().unwrap().times.len(), 4);
        {
            let mut frames = monitor.frames.lock().unwrap();
            frames.started = Some(Instant::now() - Duration::from_secs(3));
            for time in &mut frames.times {
                *time -= Duration::from_secs(2);
            }
        }
        assert_eq!(monitor.sample(true)["fps"], 0.0);
        monitor.sample(false);
        monitor.record(3, 1.0, 1, 1, || panic!("disabled monitor"));
        assert!(monitor.sample(true)["drawCalls"].is_null());
    }
}
