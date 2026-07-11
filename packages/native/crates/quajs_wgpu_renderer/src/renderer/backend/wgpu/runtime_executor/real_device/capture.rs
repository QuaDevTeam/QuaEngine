use std::fmt::{Display, Formatter};
use std::sync::mpsc;

use super::RealWgpuNativeRenderRuntimeDevice;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RealWgpuFrameCapture {
    pub width: u32,
    pub height: u32,
    pub rgba8: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RealWgpuEncodedFrameCapture {
    pub width: u32,
    pub height: u32,
    pub mime_type: &'static str,
    pub bytes: Vec<u8>,
    pub visible_pixel_count: usize,
    pub colored_pixel_count: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RealWgpuFrameCaptureError {
    message: String,
}

impl RealWgpuFrameCaptureError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl Display for RealWgpuFrameCaptureError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for RealWgpuFrameCaptureError {}

impl RealWgpuNativeRenderRuntimeDevice {
    pub fn capture_frame_rgba8(&self) -> Result<RealWgpuFrameCapture, RealWgpuFrameCaptureError> {
        if self.frame_target.completed_pass_count() == 0 {
            return Err(RealWgpuFrameCaptureError::new(
                "native frame capture requires a completed render pass",
            ));
        }
        let extent = self.frame_target.extent();
        let color_format = self.frame_target.color_format();
        let swizzle_bgra = match color_format {
            wgpu::TextureFormat::Bgra8Unorm | wgpu::TextureFormat::Bgra8UnormSrgb => true,
            wgpu::TextureFormat::Rgba8Unorm | wgpu::TextureFormat::Rgba8UnormSrgb => false,
            _ => {
                return Err(RealWgpuFrameCaptureError::new(format!(
                    "native frame capture does not support texture format {color_format:?}",
                )))
            }
        };
        let unpadded_bytes_per_row = extent.width.saturating_mul(4);
        let alignment = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
        let padded_bytes_per_row = unpadded_bytes_per_row.div_ceil(alignment) * alignment;
        let buffer_size = u64::from(padded_bytes_per_row) * u64::from(extent.height);
        let buffer = self.target.device().create_buffer(&wgpu::BufferDescriptor {
            label: Some("qua-native-frame-capture-readback"),
            size: buffer_size,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });
        let mut encoder =
            self.target
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("qua-native-frame-capture-copy"),
                });
        encoder.copy_texture_to_buffer(
            self.frame_target.texture().as_image_copy(),
            wgpu::TexelCopyBufferInfo {
                buffer: &buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_bytes_per_row),
                    rows_per_image: Some(extent.height),
                },
            },
            extent,
        );
        self.target.queue().submit(Some(encoder.finish()));

        let slice = buffer.slice(..);
        let (sender, receiver) = mpsc::sync_channel(1);
        slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = sender.send(result);
        });
        self.target
            .device()
            .poll(wgpu::PollType::wait_indefinitely())
            .map_err(|error| {
                RealWgpuFrameCaptureError::new(format!(
                    "native frame capture device poll failed: {error}",
                ))
            })?;
        receiver
            .recv()
            .map_err(|error| {
                RealWgpuFrameCaptureError::new(format!(
                    "native frame capture map callback failed: {error}",
                ))
            })?
            .map_err(|error| {
                RealWgpuFrameCaptureError::new(format!(
                    "native frame capture buffer mapping failed: {error}",
                ))
            })?;

        let mapped = slice.get_mapped_range();
        let mut rgba8 = Vec::with_capacity(
            usize::try_from(u64::from(unpadded_bytes_per_row) * u64::from(extent.height))
                .unwrap_or(0),
        );
        for row in mapped
            .chunks_exact(padded_bytes_per_row as usize)
            .take(extent.height as usize)
        {
            let pixels = &row[..unpadded_bytes_per_row as usize];
            if swizzle_bgra {
                for pixel in pixels.chunks_exact(4) {
                    rgba8.extend_from_slice(&[pixel[2], pixel[1], pixel[0], pixel[3]]);
                }
            } else {
                rgba8.extend_from_slice(pixels);
            }
        }
        drop(mapped);
        buffer.unmap();

        Ok(RealWgpuFrameCapture {
            width: extent.width,
            height: extent.height,
            rgba8,
        })
    }

    #[cfg(feature = "image-decode")]
    pub fn capture_frame_png(
        &self,
    ) -> Result<RealWgpuEncodedFrameCapture, RealWgpuFrameCaptureError> {
        use image::ImageEncoder;

        let capture = self.capture_frame_rgba8()?;
        let visible_pixel_count = capture
            .rgba8
            .chunks_exact(4)
            .filter(|pixel| pixel[3] > 0)
            .count();
        let colored_pixel_count = capture
            .rgba8
            .chunks_exact(4)
            .filter(|pixel| pixel[3] > 0 && pixel[..3].iter().any(|channel| *channel > 0))
            .count();
        let mut bytes = Vec::new();
        image::codecs::png::PngEncoder::new(&mut bytes)
            .write_image(
                &capture.rgba8,
                capture.width,
                capture.height,
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|error| {
                RealWgpuFrameCaptureError::new(format!(
                    "native frame capture PNG encoding failed: {error}",
                ))
            })?;
        Ok(RealWgpuEncodedFrameCapture {
            width: capture.width,
            height: capture.height,
            mime_type: "image/png",
            bytes,
            visible_pixel_count,
            colored_pixel_count,
        })
    }
}
