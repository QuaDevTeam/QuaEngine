//! Explicit real-GPU resource benchmark; filesystem fixtures are never a product asset path.
#[cfg(all(feature = "real-wgpu-native", feature = "image-decode"))]
fn main() {
    use quajs_wgpu_renderer::renderer::backend::wgpu::RealWgpuDecodedTextureMetadata;
    use quajs_wgpu_renderer::renderer::{
        RealWgpuNativeRenderRuntimeDevice, RealWgpuNativeRenderRuntimeTarget,
    };
    use std::{
        collections::BTreeSet,
        time::{Duration, Instant},
    };
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle());
    let adapter = pollster::block_on(instance.request_adapter(&Default::default())).unwrap();
    let info = adapter.get_info();
    let (device, queue) = pollster::block_on(adapter.request_device(&Default::default())).unwrap();
    let target = RealWgpuNativeRenderRuntimeTarget::new(
        device,
        queue,
        wgpu::TextureFormat::Rgba8UnormSrgb,
        wgpu::Extent3d {
            width: 16,
            height: 16,
            depth_or_array_layers: 1,
        },
    );
    let mut runtime = RealWgpuNativeRenderRuntimeDevice::new(target.clone());
    let mut reports = Vec::new();
    for (index, path) in std::env::args().skip(1).enumerate() {
        let bytes = std::fs::read(&path).unwrap();
        let id = format!("images:benchmark-{index}");
        let start = Instant::now();
        runtime.upload_image_texture_bytes(&id, &bytes).unwrap();
        let cold_ms = start.elapsed().as_secs_f64() * 1000.0;
        runtime.release_decoded_texture(&id);
        runtime.enable_async_image_uploads().unwrap();
        // Keep the outgoing full-size image resident during preparation. This
        // catches a budget that only permits a 4K preload on an empty stage.
        let previous_id = "images:previous";
        runtime
            .upload_image_texture_bytes(previous_id, &bytes)
            .unwrap();
        runtime.touch_image_textures(&BTreeSet::from([previous_id.into()]));
        let previous_bytes = runtime.image_memory_usage().0;
        runtime.set_image_preloads(BTreeSet::from([id.clone()]));
        let start = Instant::now();
        assert!(!runtime
            .request_image_preload(&id, &bytes, RealWgpuDecodedTextureMetadata::default())
            .unwrap());
        let reserved_peak = runtime.image_memory_usage().1;
        assert!(reserved_peak > 0 && reserved_peak <= 256 * 1024 * 1024);
        assert!(previous_bytes + reserved_peak <= 512 * 1024 * 1024);
        let enqueue_ms = start.elapsed().as_secs_f64() * 1000.0;
        while !matches!(runtime.poll_image_preload(&id), Some(Ok(true))) {
            assert!(
                start.elapsed() < Duration::from_secs(60),
                "preparation timeout"
            );
            std::thread::sleep(Duration::from_millis(1));
        }
        let preparation_ms = start.elapsed().as_secs_f64() * 1000.0;
        target.queue().submit([]);
        target
            .device()
            .poll(wgpu::PollType::wait_indefinitely())
            .unwrap();
        let mut times = Vec::new();
        for _ in 0..120 {
            runtime.touch_image_textures(&Default::default());
            runtime.retire_image_texture(&id);
            let start = Instant::now();
            runtime.touch_image_textures(&BTreeSet::from([id.clone()]));
            assert!(matches!(runtime.poll_image_preload(&id), Some(Ok(true))));
            times.push(start.elapsed().as_secs_f64() * 1000.0);
        }
        times.sort_by(f64::total_cmp);
        let snapshot = runtime.snapshot();
        runtime.set_image_memory_budget(0, 0);
        assert!(
            runtime.image_texture_is_resident(&id),
            "pressure must not blank the current image"
        );
        runtime.touch_image_textures(&Default::default());
        assert_eq!(runtime.image_memory_usage(), (0, 0));
        assert!(matches!(runtime.poll_image_preload(&id), Some(Ok(false))));
        runtime.set_image_memory_budget(256 * 1024 * 1024, 256 * 1024 * 1024);
        runtime.set_image_preloads(BTreeSet::from([id.clone()]));
        runtime
            .request_image_preload(&id, &bytes, Default::default())
            .unwrap();
        let recovery = Instant::now();
        while !matches!(runtime.poll_image_preload(&id), Some(Ok(true))) {
            assert!(recovery.elapsed() < Duration::from_secs(60));
            std::thread::sleep(Duration::from_millis(1));
        }
        reports.push(serde_json::json!({"file": path, "encodedBytes": bytes.len(),
            "coldPreparationMs": cold_ms, "asyncEnqueueMs": enqueue_ms, "backgroundPreparationMs": preparation_ms,
            "warmSwitchP99Ms": times[118], "dimensions": snapshot.resident_texture_dimensions[&id],
            "residentGpuBytesIncludingMips": snapshot.resident_texture_byte_len - previous_bytes,
            "outgoingImageGpuBytesDuringPreparation": previous_bytes,
            "reservedPreparationPeakBytes": reserved_peak,
            "pressureKeepsActiveImage": true, "pressureRetiredImageBytes": 0,
            "recoveryPreloadMs": recovery.elapsed().as_secs_f64() * 1000.0}));
        runtime.clear_image_cache();
        assert_eq!(runtime.snapshot().resident_texture_count, 0);
    }
    println!(
        "{}",
        serde_json::json!({"adapter": info.name, "backend": format!("{:?}", info.backend), "resources": reports})
    );
}

#[cfg(not(all(feature = "real-wgpu-native", feature = "image-decode")))]
fn main() {
    panic!("Enable real-wgpu-native,image-decode for this benchmark");
}
