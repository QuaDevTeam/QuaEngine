//! Bounded, renderer-local image preparation. Decode, alpha conversion, mipmaps
//! and GPU writes happen off the frame thread; only completed textures are adopted.
use super::{
    texture::{
        create_runtime_decoded_texture_rgba8, decode_image_bytes_rgba8, RealRuntimeDecodedTexture,
        RealWgpuDecodedTextureMetadata,
    },
    RealWgpuNativeRenderRuntimeTarget,
};
use crate::renderer::backend::wgpu::runtime_executor::WgpuNativeRenderRuntimeError;
use std::{
    collections::BTreeMap,
    sync::{mpsc, Arc, Mutex},
    thread::JoinHandle,
};

type TextureResult = Result<RealRuntimeDecodedTexture, WgpuNativeRenderRuntimeError>;
#[derive(Debug)]
struct Pending {
    generation: u64,
    metadata: RealWgpuDecodedTextureMetadata,
    result: Option<TextureResult>,
}
#[derive(Debug, Default)]
struct State {
    generation: u64,
    jobs: BTreeMap<String, Pending>,
    bytes: usize,
    // Includes cancelled queued/running work until the worker actually drops it,
    // and completed GPU results until adoption or release.
    reservations: BTreeMap<u64, usize>,
}
struct Request {
    id: String,
    generation: u64,
    bytes: Vec<u8>,
    metadata: RealWgpuDecodedTextureMetadata,
}
#[derive(Debug)]
pub(super) struct AsyncTextures {
    state: Arc<Mutex<State>>,
    sender: Option<mpsc::SyncSender<Request>>,
    worker: Option<JoinHandle<()>>,
}
impl AsyncTextures {
    pub(super) fn new(target: RealWgpuNativeRenderRuntimeTarget) -> std::io::Result<Self> {
        let state = Arc::new(Mutex::new(State::default()));
        let shared = state.clone();
        let (sender, receiver) = mpsc::sync_channel::<Request>(4);
        let worker = std::thread::Builder::new()
            .name("qua-image-upload".into())
            .spawn(move || {
                while let Ok(request) = receiver.recv() {
                    let active = || {
                        shared
                            .lock()
                            .unwrap()
                            .jobs
                            .get(&request.id)
                            .is_some_and(|job| job.generation == request.generation)
                    };
                    let result = active().then(|| {
                        decode_image_bytes_rgba8(&request.id, &request.bytes).and_then(|decoded| {
                            if !active() {
                                return super::invalid_order(
                                    "Image preparation cancelled before upload",
                                );
                            }
                            create_runtime_decoded_texture_rgba8(
                                &target,
                                &request.id,
                                decoded,
                                request.metadata,
                            )
                        })
                    });
                    let encoded_len = request.bytes.len();
                    drop(request.bytes);
                    let mut state = shared.lock().unwrap();
                    state.bytes = state.bytes.saturating_sub(encoded_len);
                    if let Some(job) = state
                        .jobs
                        .get_mut(&request.id)
                        .filter(|job| job.generation == request.generation)
                    {
                        job.result = result;
                    } else {
                        // Drop the cancelled GPU handle before another request
                        // can reuse its reservation after this lock is released.
                        drop(result);
                        state.reservations.remove(&request.generation);
                    }
                }
            })?;
        Ok(Self {
            state,
            sender: Some(sender),
            worker: Some(worker),
        })
    }
    pub(super) fn request(
        &self,
        id: &str,
        bytes: &[u8],
        metadata: RealWgpuDecodedTextureMetadata,
        peak_bytes: usize,
    ) -> bool {
        let mut state = self.state.lock().unwrap();
        if state.jobs.contains_key(id) {
            return true;
        }
        // Bound both queued bytes and completed-but-not-yet-adopted GPU handles.
        if state.reservations.len() >= 4
            || state.bytes.saturating_add(bytes.len()) > 64 * 1024 * 1024
            || state
                .reservations
                .values()
                .sum::<usize>()
                .saturating_add(peak_bytes)
                > super::texture::preparation::MAX_PREPARATION_BYTES
        {
            return false;
        }
        state.generation = state.generation.wrapping_add(1);
        let generation = state.generation;
        let request = Request {
            id: id.into(),
            generation,
            bytes: bytes.to_vec(),
            metadata: metadata.clone(),
        };
        if self.sender.as_ref().unwrap().try_send(request).is_err() {
            return false;
        }
        state.bytes += bytes.len();
        state.reservations.insert(generation, peak_bytes);
        state.jobs.insert(
            id.into(),
            Pending {
                generation,
                metadata,
                result: None,
            },
        );
        true
    }
    pub(super) fn poll(&self, id: &str) -> Option<Option<TextureResult>> {
        let mut state = self.state.lock().unwrap();
        if !state.jobs.contains_key(id) {
            return (state.reservations.len() >= 4 || state.bytes >= 64 * 1024 * 1024)
                .then_some(None);
        }
        if state.jobs.get(id)?.result.is_none() {
            return Some(None);
        }
        let job = state.jobs.remove(id)?;
        state.reservations.remove(&job.generation);
        Some(job.result)
    }
    pub(super) fn job_count(&self) -> usize {
        self.state.lock().unwrap().reservations.len()
    }
    pub(super) fn reserved_bytes(&self) -> usize {
        self.state.lock().unwrap().reservations.values().sum()
    }
    pub(super) fn retain(&self, ids: &std::collections::BTreeSet<String>) {
        self.remove_if(|id, _| !ids.contains(id));
    }
    pub(super) fn release(&self, id: &str) {
        self.remove_if(|key, _| key == id);
    }
    pub(super) fn release_package(&self, id: &str) {
        self.remove_if(|_, job| {
            job.metadata.owner_package_id.as_deref() == Some(id)
                || job.metadata.required_package_ids.contains(id)
        });
    }
    fn remove_if(&self, mut remove: impl FnMut(&str, &Pending) -> bool) {
        let mut state = self.state.lock().unwrap();
        let State {
            jobs, reservations, ..
        } = &mut *state;
        jobs.retain(|id, job| {
            if !remove(id, job) {
                return true;
            }
            if job.result.is_some() {
                reservations.remove(&job.generation);
            }
            false
        });
    }
}
impl Drop for AsyncTextures {
    fn drop(&mut self) {
        self.state.lock().unwrap().jobs.clear();
        self.sender.take();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

#[cfg(all(test, feature = "real-wgpu-noop"))]
mod tests {
    use super::*;
    #[test]
    fn cancellation_does_not_refund_memory_still_owned_by_the_queue() {
        let (sender, _receiver) = mpsc::sync_channel(4);
        let worker = AsyncTextures {
            state: Default::default(),
            sender: Some(sender),
            worker: None,
        };
        let peak = 300 * 1024 * 1024;
        assert!(worker.request("images:queued", &[1], Default::default(), peak));
        worker.retain(&Default::default());
        assert_eq!(worker.reserved_bytes(), peak);
        assert_eq!(worker.job_count(), 1);
        assert!(!worker.request("images:more", &[1], Default::default(), peak));
    }
    #[test]
    fn completed_results_keep_their_reservation_until_released() {
        let (sender, _receiver) = mpsc::sync_channel(4);
        let worker = AsyncTextures {
            state: Default::default(),
            sender: Some(sender),
            worker: None,
        };
        assert!(worker.request("images:ready", &[1], Default::default(), 123));
        worker
            .state
            .lock()
            .unwrap()
            .jobs
            .get_mut("images:ready")
            .unwrap()
            .result = Some(super::super::invalid_order("test result"));
        assert_eq!(worker.reserved_bytes(), 123);
        worker.release("images:ready");
        assert_eq!(worker.reserved_bytes(), 0);
    }
    #[test]
    fn background_uploads_cancel_stale_generations_and_adopt_only_completed_images() {
        let target = RealWgpuNativeRenderRuntimeTarget::noop(16, 16);
        let worker = AsyncTextures::new(target).unwrap();
        let mut encoded = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(2, 2)
            .write_to(&mut encoded, image::ImageFormat::Png)
            .unwrap();
        assert!(worker.request(
            "images:test",
            encoded.get_ref(),
            Default::default(),
            1024 * 1024
        ));
        worker.release("images:test");
        assert!(worker.request(
            "images:test",
            b"invalid-image",
            Default::default(),
            1024 * 1024
        ));
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        loop {
            match worker.poll("images:test") {
                Some(Some(result)) => {
                    assert!(result.is_err());
                    break;
                }
                Some(None) if std::time::Instant::now() < deadline => {
                    std::thread::sleep(std::time::Duration::from_millis(1))
                }
                _ => panic!("Image preparation did not finish"),
            }
        }
        assert!(worker.poll("images:test").is_none());
        for n in 0..4 {
            assert!(worker.request(
                &format!("images:{n}"),
                encoded.get_ref(),
                Default::default(),
                1024 * 1024
            ));
        }
        assert!(!worker.request(
            "images:overflow",
            encoded.get_ref(),
            Default::default(),
            1024 * 1024
        ));
        worker.retain(&Default::default());
        assert!(!worker.state.lock().unwrap().jobs.contains_key("images:0"));
    }
}
