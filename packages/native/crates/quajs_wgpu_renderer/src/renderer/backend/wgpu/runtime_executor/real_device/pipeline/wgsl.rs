pub(super) const SOLID_COLOR_WGSL: &str = r#"
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
};

struct FrameUniforms {
    target_size: vec2<f32>,
    _padding: vec2<f32>,
};

@group(0) @binding(0)
var<uniform> frame: FrameUniforms;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let clip = vec2<f32>(
        (input.position.x / max(frame.target_size.x, 1.0)) * 2.0 - 1.0,
        1.0 - (input.position.y / max(frame.target_size.y, 1.0)) * 2.0,
    );
    output.position = vec4<f32>(clip, 0.0, 1.0);
    output.uv = input.uv;
    output.color = input.color;
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.color;
}
"#;

pub(super) const TEXTURED_QUAD_WGSL: &str = r#"
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
};

struct FrameUniforms {
    target_size: vec2<f32>,
    _padding: vec2<f32>,
};

@group(0) @binding(0)
var<uniform> frame: FrameUniforms;

@group(1) @binding(0)
var texture_sampler: sampler;

@group(1) @binding(1)
var texture_source: texture_2d<f32>;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let clip = vec2<f32>(
        (input.position.x / max(frame.target_size.x, 1.0)) * 2.0 - 1.0,
        1.0 - (input.position.y / max(frame.target_size.y, 1.0)) * 2.0,
    );
    output.position = vec4<f32>(clip, 0.0, 1.0);
    output.uv = input.uv;
    output.color = input.color;
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let sample = textureSample(texture_source, texture_sampler, input.uv);
    return sample * input.color;
}
"#;

pub(super) const TEXT_ATLAS_WGSL: &str = r#"
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
};

struct FrameUniforms {
    target_size: vec2<f32>,
    _padding: vec2<f32>,
};

@group(0) @binding(0)
var<uniform> frame: FrameUniforms;

@group(1) @binding(0)
var text_atlas_sampler: sampler;

@group(1) @binding(1)
var text_atlas: texture_2d<f32>;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let clip = vec2<f32>(
        (input.position.x / max(frame.target_size.x, 1.0)) * 2.0 - 1.0,
        1.0 - (input.position.y / max(frame.target_size.y, 1.0)) * 2.0,
    );
    output.position = vec4<f32>(clip, 0.0, 1.0);
    output.uv = input.uv;
    output.color = input.color;
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let mask = textureSample(text_atlas, text_atlas_sampler, input.uv).a;
    return vec4<f32>(input.color.rgb, input.color.a * mask);
}
"#;
