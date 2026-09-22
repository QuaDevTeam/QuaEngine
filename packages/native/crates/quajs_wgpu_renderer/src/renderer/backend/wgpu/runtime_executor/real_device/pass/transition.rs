//! One bounded asynchronous compiler per compositor. Invalid author shaders are
//! reported through readiness; until compilation succeeds the old image stays.
use super::super::RealWgpuNativeRenderRuntimeTarget;
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug, Default)]
pub(super) struct TransitionCompiler(Arc<Mutex<State>>);
#[derive(Debug, Default)]
struct State {
    source: String,
    running: bool,
    result: Option<Result<wgpu::RenderPipeline, String>>,
}
impl TransitionCompiler {
    pub(super) fn prepare(
        &self,
        target: &RealWgpuNativeRenderRuntimeTarget,
        layout: &wgpu::BindGroupLayout,
        source: &str,
        asynchronous: bool,
    ) -> Option<Result<wgpu::RenderPipeline, String>> {
        let mut state = self.0.lock().unwrap();
        if state.source == source {
            return state.result.clone();
        }
        // A superseding transition waits for the single in-flight compilation.
        if state.running {
            return None;
        }
        state.source = source.into();
        state.result = None;
        if source.is_empty() || source.len() > 65536 {
            state.result = Some(Err(
                "Background WGSL source must contain 1..65536 bytes".into()
            ));
            return state.result.clone();
        }
        if !asynchronous {
            state.result = Some(compile(target, layout, source));
            return state.result.clone();
        }
        state.running = true;
        let shared = self.0.clone();
        let target = target.clone();
        let layout = layout.clone();
        let source = source.to_string();
        if let Err(error) = std::thread::Builder::new()
            .name("qua-transition-shader".into())
            .spawn(move || {
                let result = compile(&target, &layout, &source);
                let mut state = shared.lock().unwrap();
                state.running = false;
                state.result = Some(result);
            })
        {
            state.running = false;
            state.result = Some(Err(error.to_string()));
        }
        None
    }
    pub(super) fn status(&self, source: &str) -> Result<bool, String> {
        let state = self.0.lock().unwrap();
        if state.source != source {
            return Ok(false);
        }
        match &state.result {
            None => Ok(false),
            Some(Ok(_)) => Ok(true),
            Some(Err(error)) => Err(error.clone()),
        }
    }
}

fn compile(
    target: &RealWgpuNativeRenderRuntimeTarget,
    layout: &wgpu::BindGroupLayout,
    source: &str,
) -> Result<wgpu::RenderPipeline, String> {
    let device = target.device();
    let scope = device.push_error_scope(wgpu::ErrorFilter::Validation);
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("qua-native::background-transition"),
        source: wgpu::ShaderSource::Wgsl(format!("{HEADER}\n{source}\n{FOOTER}").into()),
    });
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("qua-native::background-transition-layout"),
        bind_group_layouts: &[Some(layout)],
        immediate_size: 0,
    });
    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("qua-native::background-transition"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &module,
            entry_point: Some("vs_main"),
            compilation_options: Default::default(),
            buffers: &[],
        },
        primitive: Default::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState {
            count: target.sample_count(),
            ..Default::default()
        },
        fragment: Some(wgpu::FragmentState {
            module: &module,
            entry_point: Some("fs_main"),
            compilation_options: Default::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format: target.frame_color_format(),
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        multiview_mask: None,
        cache: None,
    });
    if let Some(error) = pollster::block_on(scope.pop()) {
        return Err(error.to_string());
    }
    Ok(pipeline)
}

const HEADER: &str = r#"
@group(0) @binding(0) var toTexture: texture_2d<f32>;
@group(0) @binding(2) var fromTexture: texture_2d<f32>;
struct TransitionUniforms { timing: vec4<f32>, params: vec4<f32>, viewport: vec4<f32> }
@group(0) @binding(1) var<uniform> uniforms: TransitionUniforms;
var<private> progress: f32;
var<private> params: vec4<f32>;
fn sampleImage(image: texture_2d<f32>, uv: vec2<f32>) -> vec4<f32> {
    let size = vec2<i32>(textureDimensions(image));
    let p = uniforms.viewport.xy + clamp(uv, vec2(0.0), vec2(1.0)) * uniforms.viewport.zw - 0.5;
    let base = vec2<i32>(floor(p)); let w = fract(p);
    return mix(mix(textureLoad(image, clamp(base, vec2(0), size-1), 0), textureLoad(image, clamp(base+vec2(1,0), vec2(0), size-1), 0), w.x),
               mix(textureLoad(image, clamp(base+vec2(0,1), vec2(0), size-1), 0), textureLoad(image, clamp(base+vec2(1,1), vec2(0), size-1), 0), w.x), w.y);
}
fn sampleFrom(uv: vec2<f32>) -> vec4<f32> { return sampleImage(fromTexture, uv); }
fn sampleTo(uv: vec2<f32>) -> vec4<f32> { return sampleImage(toTexture, uv); }
@vertex fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
    let p = vec2<f32>(f32((index << 1u) & 2u), f32(index & 2u));
    return vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
"#;
const FOOTER: &str = r#"
@fragment fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    progress = clamp(uniforms.timing.x, 0.0, 1.0); params = uniforms.params;
    let uv = (position.xy - uniforms.viewport.xy) / uniforms.viewport.zw;
    if (any(uv < vec2(0.0)) || any(uv > vec2(1.0))) { return vec4(0.0); }
    return transition(uv);
}
"#;

#[cfg(all(test, feature = "real-wgpu-noop"))]
mod tests {
    use super::*;
    #[test]
    fn background_shader_compiles_author_function_and_reports_invalid_source() {
        let target = RealWgpuNativeRenderRuntimeTarget::noop(16, 16);
        let entries: Vec<_> = (0..3)
            .map(|binding| wgpu::BindGroupLayoutEntry {
                binding,
                visibility: wgpu::ShaderStages::FRAGMENT,
                count: None,
                ty: if binding == 1 {
                    wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    }
                } else {
                    wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    }
                },
            })
            .collect();
        let layout = target
            .device()
            .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: None,
                entries: &entries,
            });
        let valid = "fn transition(uv: vec2<f32>) -> vec4<f32> { return mix(sampleFrom(uv), sampleTo(uv), smoothstep(uv.x-params.x, uv.x+params.x, progress)); }";
        for asynchronous in [false, true] {
            let compiler = TransitionCompiler::default();
            for (source, success) in [(valid, true), ("invalid wgsl", false)] {
                let result = compiler.prepare(&target, &layout, source, asynchronous);
                if asynchronous {
                    assert!(result.is_none());
                }
                let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
                while compiler.status(source) == Ok(false) {
                    assert!(
                        std::time::Instant::now() < deadline,
                        "shader worker stalled"
                    );
                    std::thread::sleep(std::time::Duration::from_millis(1));
                }
                assert_eq!(compiler.status(source).is_ok(), success);
                assert_eq!(
                    compiler
                        .prepare(&target, &layout, source, asynchronous)
                        .unwrap()
                        .is_ok(),
                    success
                );
            }
        }
    }
}
