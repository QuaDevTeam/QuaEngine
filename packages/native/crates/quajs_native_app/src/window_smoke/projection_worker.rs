//! Off-thread driver for the Rust native projection runtime.
//!
//! The winit event thread owns wgpu encode + present. Projection work (frame
//! diffing, typewriter reveal, presence transitions, scene transitions) used to
//! run inline on that same thread, so every projection directly ate into the
//! frame budget. This module hands projection to a resident worker thread and
//! publishes finished frames back to the render thread through a mutex, so the
//! two stages overlap instead of serializing.

use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;

use quajs_native_runtime::{NativeRendererIntent, QuickJsPipelineMessage};
use quajs_wgpu_renderer::projection_runtime::NativeRendererProjectionRuntime;
use winit::event_loop::EventLoopProxy;

use super::error::NativeWindowSmokeError;

/// Work handed to the projection worker thread.
enum ProjectionRequest {
    /// Apply resident-QuickJS pipeline events to the projection runtime.
    PipelineEvents(Vec<QuickJsPipelineMessage>),
    /// Re-project the current frame so time-driven local work advances.
    Tick,
    Shutdown,
}

/// A projection the worker finished and the render thread has not drawn yet.
pub(super) struct NativeProjectionResult {
    pub(super) json: String,
    pub(super) local_work_active: bool,
    pub(super) font_prewarm_texts: Vec<String>,
    pub(super) target_frame_rate: Option<u32>,
}

/// Everything the worker hands back to the render thread after a projection.
#[derive(Default)]
struct ProjectionPublication {
    result: Option<NativeProjectionResult>,
    intents: Vec<NativeRendererIntent>,
    error: Option<String>,
}

pub(super) struct NativeProjectionWorker {
    /// Shared with the worker. The render thread only locks this for the rare
    /// input-driven mutations that must resolve synchronously.
    runtime: Arc<Mutex<NativeRendererProjectionRuntime>>,
    publication: Arc<Mutex<ProjectionPublication>>,
    sender: Option<mpsc::Sender<ProjectionRequest>>,
    worker: Option<JoinHandle<()>>,
    /// Milliseconds the last `project_now()` call took inside the worker.
    last_projection_ms: Arc<std::sync::atomic::AtomicU64>,
    /// Whether the last frame taken by the render thread was a fresh one or a
    /// reused cached projection.
    last_frame_was_cached: Arc<std::sync::atomic::AtomicBool>,
    /// Renderer-local transitions running in the last projected frame.
    last_active_transition_count: Arc<std::sync::atomic::AtomicUsize>,
}

impl NativeProjectionWorker {
    /// Moves an already-seeded projection runtime onto a resident worker thread.
    pub(super) fn spawn(
        runtime: NativeRendererProjectionRuntime,
        event_loop_proxy: EventLoopProxy<()>,
    ) -> Result<Self, NativeWindowSmokeError> {
        let runtime = Arc::new(Mutex::new(runtime));
        let publication = Arc::new(Mutex::new(ProjectionPublication::default()));
        let last_projection_ms = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let last_frame_was_cached = Arc::new(std::sync::atomic::AtomicBool::new(true));
        let last_active_transition_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let (sender, receiver) = mpsc::channel();
        let worker_runtime = runtime.clone();
        let worker_publication = publication.clone();
        let worker_projection_ms = last_projection_ms.clone();
        let worker_transition_count = last_active_transition_count.clone();
        let worker = std::thread::Builder::new()
            .name("quaengine-projection".to_string())
            .spawn(move || {
                run_projection_worker(
                    worker_runtime,
                    worker_publication,
                    receiver,
                    event_loop_proxy,
                    worker_projection_ms,
                    worker_transition_count,
                )
            })
            .map_err(|error| {
                NativeWindowSmokeError::new(format!(
                    "Failed to start the native projection worker thread: {error}."
                ))
            })?;

        Ok(Self {
            runtime,
            publication,
            sender: Some(sender),
            worker: Some(worker),
            last_projection_ms,
            last_frame_was_cached,
            last_active_transition_count,
        })
    }

    /// Queues resident-QuickJS pipeline events for the worker to apply. Events
    /// are applied off-thread, so failures surface from the next
    /// [`Self::take_latest_projection`].
    pub(super) fn apply_pipeline_events(
        &self,
        messages: Vec<QuickJsPipelineMessage>,
    ) -> Result<(), NativeWindowSmokeError> {
        if messages.is_empty() {
            return Ok(());
        }
        self.send(ProjectionRequest::PipelineEvents(messages))
    }

    /// Asks the worker to re-project so time-driven local work advances.
    pub(super) fn request_tick(&self) {
        let _ = self.send(ProjectionRequest::Tick);
    }

    /// Takes the newest finished projection, or `None` when the worker has not
    /// published anything since the last call. The render thread reuses its own
    /// cached frame in that case instead of stalling on projection work.
    pub(super) fn take_latest_projection(
        &self,
    ) -> Result<Option<NativeProjectionResult>, NativeWindowSmokeError> {
        let mut publication = self.publication.lock().map_err(|_| {
            NativeWindowSmokeError::new("Native projection worker publication lock was poisoned.")
        })?;
        if let Some(error) = publication.error.take() {
            return Err(NativeWindowSmokeError::new(error));
        }
        let result = publication.result.take();
        self.last_frame_was_cached
            .store(result.is_none(), std::sync::atomic::Ordering::Relaxed);
        Ok(result)
    }

    /// True when the worker published a projection the render thread has not
    /// consumed yet. Used to wake the event loop for a redraw.
    pub(super) fn has_fresh_projection(&self) -> bool {
        self.publication
            .lock()
            .map(|publication| publication.result.is_some() || publication.error.is_some())
            .unwrap_or(false)
    }

    /// Takes renderer intents the worker queued while projecting.
    pub(super) fn drain_intents(&self) -> Vec<NativeRendererIntent> {
        self.publication
            .lock()
            .map(|mut publication| std::mem::take(&mut publication.intents))
            .unwrap_or_default()
    }

    /// Milliseconds the last `project_now()` call took in the worker thread.
    /// Safe to call from the render thread; backed by a relaxed atomic.
    pub(super) fn last_projection_ms(&self) -> f64 {
        let bits = self
            .last_projection_ms
            .load(std::sync::atomic::Ordering::Relaxed);
        f64::from_bits(bits)
    }

    /// True when the last frame the render thread consumed was a cached
    /// (unchanged) projection, meaning the worker had nothing new ready.
    pub(super) fn last_frame_was_cached(&self) -> bool {
        self.last_frame_was_cached
            .load(std::sync::atomic::Ordering::Relaxed)
    }

    /// Renderer-local transitions (timeline animations, presence fades, the
    /// typewriter reveal, the scene transition) running in the last projection.
    pub(super) fn last_active_transition_count(&self) -> usize {
        self.last_active_transition_count
            .load(std::sync::atomic::Ordering::Relaxed)
    }

    /// Scrolls the innermost scroll node under a logical stage point.
    ///
    /// Locks the shared runtime because the caller needs the hit-test result
    /// synchronously to decide whether to request a redraw, then queues a tick
    /// so the worker republishes with the new offset.
    pub(super) fn scroll_at(
        &self,
        client_x: f64,
        client_y: f64,
        delta_x: f64,
        delta_y: f64,
    ) -> bool {
        let Ok(mut runtime) = self.runtime.lock() else {
            return false;
        };
        let scrolled = runtime.scroll_at_client(client_x, client_y, delta_x, delta_y);
        drop(runtime);
        if scrolled {
            self.request_tick();
        }
        scrolled
    }

    /// Reveals the rest of a typewriter line. This has to resolve synchronously
    /// because the caller decides from the result whether the advance input is
    /// consumed locally or forwarded to the JS product.
    pub(super) fn reveal_dialogue_on_advance(&self) -> bool {
        let revealed = self
            .runtime
            .lock()
            .map(|mut runtime| runtime.reveal_dialogue_on_advance())
            .unwrap_or(false);
        if revealed {
            self.request_tick();
        }
        revealed
    }

    fn send(&self, request: ProjectionRequest) -> Result<(), NativeWindowSmokeError> {
        let Some(sender) = self.sender.as_ref() else {
            return Ok(());
        };
        sender.send(request).map_err(|error| {
            NativeWindowSmokeError::new(format!(
                "Failed to queue work on the native projection worker thread: {error}."
            ))
        })
    }
}

impl Drop for NativeProjectionWorker {
    fn drop(&mut self) {
        if let Some(sender) = self.sender.take() {
            let _ = sender.send(ProjectionRequest::Shutdown);
        }
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn run_projection_worker(
    runtime: Arc<Mutex<NativeRendererProjectionRuntime>>,
    publication: Arc<Mutex<ProjectionPublication>>,
    receiver: mpsc::Receiver<ProjectionRequest>,
    event_loop_proxy: EventLoopProxy<()>,
    projection_ms_out: Arc<std::sync::atomic::AtomicU64>,
    transition_count_out: Arc<std::sync::atomic::AtomicUsize>,
) {
    // JSON of the last frame we published. Kept on the worker side so we can
    // skip the publish (and the event-loop wake) when nothing changed.
    let mut last_published_json: Option<String> = None;

    while let Ok(request) = receiver.recv() {
        let mut requests = vec![request];
        // Coalesce everything already queued. A slow projection must not build a
        // backlog of stale ticks, but state-carrying pipeline events still have
        // to be applied in order.
        while let Ok(request) = receiver.try_recv() {
            requests.push(request);
        }
        if requests
            .iter()
            .any(|request| matches!(request, ProjectionRequest::Shutdown))
        {
            return;
        }

        let Ok(mut guard) = runtime.lock() else {
            return;
        };
        let mut failure = None;
        for request in requests {
            match request {
                ProjectionRequest::PipelineEvents(messages) => {
                    for message in messages {
                        if let Err(error) =
                            guard.apply_pipeline_event(&message.event, &message.payload_json)
                        {
                            failure = Some(format!(
                                "Failed to apply native pipeline event {}: {error}.",
                                message.event
                            ));
                            break;
                        }
                    }
                }
                ProjectionRequest::Tick => {}
                ProjectionRequest::Shutdown => return,
            }
            if failure.is_some() {
                break;
            }
        }

        let projected = if failure.is_some() {
            None
        } else {
            let t0 = std::time::Instant::now();
            let result = match guard.project_now() {
                Ok(frame) => {
                    transition_count_out.store(
                        frame.active_transition_count,
                        std::sync::atomic::Ordering::Relaxed,
                    );
                    Some(NativeProjectionResult {
                        json: frame.json,
                        local_work_active: frame.local_work_active,
                        font_prewarm_texts: guard.font_prewarm_texts(),
                        target_frame_rate: frame.target_frame_rate,
                    })
                }
                Err(error) => {
                    failure = Some(format!(
                        "Rust native projection runtime failed to project a frame: {error}."
                    ));
                    None
                }
            };
            // Store as bit-cast so the render thread can read it without a mutex.
            projection_ms_out.store(
                (t0.elapsed().as_secs_f64() * 1_000.0).to_bits(),
                std::sync::atomic::Ordering::Relaxed,
            );
            result
        };
        let intents = guard.drain_intents();
        drop(guard);

        // Skip-republish: when the projection JSON is identical to the last
        // published frame *and* there is no local work running (animations,
        // typewriter, presence fades) and no intents, the render thread will
        // produce exactly the same composed string it already has cached. Avoid
        // waking the event loop at all; the pacer will still dispatch the next
        // frame on schedule so the cadence is unaffected.
        let should_publish = failure.is_some() || {
            let unchanged = projected.as_ref().is_some_and(|p| {
                !p.local_work_active
                    && last_published_json
                        .as_deref()
                        .is_some_and(|prev| prev == p.json)
            });
            !unchanged || !intents.is_empty()
        };

        {
            let Ok(mut publication) = publication.lock() else {
                return;
            };
            if let Some(failure) = failure {
                log::error!("Projection worker failed: {failure}");
                publication.error = Some(failure);
            }
            if should_publish {
                if let Some(result) = &projected {
                    last_published_json = Some(result.json.clone());
                }
                if let Some(result) = projected {
                    publication.result = Some(result);
                }
            }
            publication.intents.extend(intents);
        }

        if should_publish {
            // Wake the winit thread so it can pick the projection up and redraw.
            if event_loop_proxy.send_event(()).is_err() {
                return;
            }
        }
    }
}
