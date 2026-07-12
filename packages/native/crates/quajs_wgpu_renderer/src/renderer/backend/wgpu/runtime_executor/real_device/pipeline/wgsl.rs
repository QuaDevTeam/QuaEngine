pub(super) const SOLID_COLOR_WGSL: &str = r#"
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) color: vec4<f32>,
    @location(3) effect0: vec4<f32>,
    @location(4) effect1: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) effect0: vec4<f32>,
    @location(3) effect1: vec4<f32>,
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
    output.effect0 = input.effect0;
    output.effect1 = input.effect1;
    return output;
}

fn rounded_distance(point: vec2<f32>, half_size: vec2<f32>, radius: f32) -> f32 {
    let safe_radius = min(radius, min(half_size.x, half_size.y));
    let q = abs(point) - (half_size - vec2<f32>(safe_radius));
    return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - safe_radius;
}

fn erf_approx(value: f32) -> f32 {
    let sign = select(-1.0, 1.0, value >= 0.0);
    let x = abs(value);
    let t = 1.0 / (1.0 + 0.3275911 * x);
    let polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
    return sign * (1.0 - polynomial * exp(-x * x));
}

fn gaussian_tail(distance: f32, sigma: f32) -> f32 {
    if (sigma <= 0.001) {
        return select(0.0, 1.0, distance < 0.0);
    }
    return 0.5 * (1.0 - erf_approx(distance / (1.41421356237 * sigma)));
}

fn gaussian_cdf(distance: f32, sigma: f32) -> f32 {
    if (sigma <= 0.001) {
        return select(0.0, 1.0, distance >= 0.0);
    }
    return 0.5 * (1.0 + erf_approx(distance / (1.41421356237 * sigma)));
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let gradient_mode = input.effect1.w;
    if (gradient_mode > 3.5 && gradient_mode < 4.5) {
        let direction = input.effect1.xy;
        let extent = max(0.5 * (abs(direction.x) + abs(direction.y)), 0.0001);
        let progress = clamp(dot(input.uv - vec2<f32>(0.5), direction) / (2.0 * extent) + 0.5, 0.0, 1.0);
        return mix(input.color, input.effect0, progress);
    }
    if (gradient_mode > 4.5) {
        let progress = clamp(distance(input.uv, input.effect1.xy) / max(input.effect1.z, 0.0001), 0.0, 1.0);
        return mix(input.color, input.effect0, progress);
    }

    let mode = input.effect0.x;
    if (mode < 0.5) {
        return input.color;
    }

    // Shadow UVs are source-box-relative. The source dimensions are carried
    // explicitly in effect1.zw so quad interpolation does not change the
    // distance-field scale.
    let source_size = vec2<f32>(
        max(input.effect1.z, 1.0),
        max(-input.effect1.w, 1.0),
    );
    let source_point = input.uv * source_size;
    let sigma = input.effect0.y;
    let source_radius = max(input.effect0.z, 0.0);
    let spread = input.effect0.w;
    let offset = input.effect1.xy;
    let source_half = source_size * 0.5;
    let source_distance = rounded_distance(source_point - source_half, source_half, source_radius);
    let source_aa = max(fwidth(source_distance), 0.75);

    if (mode < 1.5) {
        let shape_half = source_half + vec2<f32>(spread);
        let shape_center = source_half + offset;
        let shape_radius = max(source_radius + spread, 0.0);
        let distance = rounded_distance(source_point - shape_center, shape_half, shape_radius);
        let outside_source = smoothstep(-source_aa, source_aa, source_distance);
        return vec4<f32>(input.color.rgb, input.color.a * gaussian_tail(distance, sigma) * outside_source);
    }

    let hole_half = max(source_half - vec2<f32>(spread), vec2<f32>(0.5));
    let hole_center = source_half + offset;
    let hole_radius = max(source_radius - spread, 0.0);
    let hole_distance = rounded_distance(source_point - hole_center, hole_half, hole_radius);
    let inside_source = 1.0 - smoothstep(-source_aa, source_aa, source_distance);
    return vec4<f32>(input.color.rgb, input.color.a * gaussian_cdf(hole_distance, sigma) * inside_source);
}
"#;

pub(super) const TEXTURED_QUAD_WGSL: &str = r#"
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) color: vec4<f32>,
    @location(3) effect0: vec4<f32>,
    @location(4) effect1: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) effect0: vec4<f32>,
    @location(3) effect1: vec4<f32>,
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
    output.effect0 = input.effect0;
    output.effect1 = input.effect1;
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let sample = textureSample(texture_source, texture_sampler, input.uv);
    if (input.effect1.x > 0.5) {
        let luminance = dot(sample.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
        let desaturated = vec3<f32>(luminance);
        let filtered = mix(desaturated, sample.rgb, max(input.effect0.y, 0.0));
        return vec4<f32>(filtered * max(input.effect0.x, 0.0), sample.a) * input.color;
    }
    return sample * input.color;
}
"#;

pub(super) const TEXT_ATLAS_WGSL: &str = r#"
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) color: vec4<f32>,
    @location(3) effect0: vec4<f32>,
    @location(4) effect1: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) effect0: vec4<f32>,
    @location(3) effect1: vec4<f32>,
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
    output.effect0 = input.effect0;
    output.effect1 = input.effect1;
    return output;
}

fn bounded_text_mask(uv: vec2<f32>, uv_min: vec2<f32>, uv_max: vec2<f32>) -> f32 {
    let inside = step(uv_min.x, uv.x)
        * step(uv_min.y, uv.y)
        * step(uv.x, uv_max.x)
        * step(uv.y, uv_max.y);
    let clamped_uv = clamp(uv, uv_min, uv_max);
    return textureSampleLevel(text_atlas, text_atlas_sampler, clamped_uv, 0.0).a * inside;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    if (input.effect0.x < 0.5) {
        let mask = textureSample(text_atlas, text_atlas_sampler, input.uv).a;
        return vec4<f32>(input.color.rgb, input.color.a * mask);
    }

    let uv_min = input.effect0.zw;
    let uv_max = input.effect1.xy;
    let sigma_uv = fwidth(input.uv) * max(input.effect0.y, 0.5);
    let inner = sigma_uv * 1.1;
    let outer = sigma_uv * 2.4;
    let diagonal = outer * 0.70710678118;
    var mask = bounded_text_mask(input.uv, uv_min, uv_max) * 0.20;
    mask += bounded_text_mask(input.uv + vec2<f32>(inner.x, 0.0), uv_min, uv_max) * 0.14;
    mask += bounded_text_mask(input.uv - vec2<f32>(inner.x, 0.0), uv_min, uv_max) * 0.14;
    mask += bounded_text_mask(input.uv + vec2<f32>(0.0, inner.y), uv_min, uv_max) * 0.14;
    mask += bounded_text_mask(input.uv - vec2<f32>(0.0, inner.y), uv_min, uv_max) * 0.14;
    mask += bounded_text_mask(input.uv + vec2<f32>(outer.x, 0.0), uv_min, uv_max) * 0.03;
    mask += bounded_text_mask(input.uv - vec2<f32>(outer.x, 0.0), uv_min, uv_max) * 0.03;
    mask += bounded_text_mask(input.uv + vec2<f32>(0.0, outer.y), uv_min, uv_max) * 0.03;
    mask += bounded_text_mask(input.uv - vec2<f32>(0.0, outer.y), uv_min, uv_max) * 0.03;
    mask += bounded_text_mask(input.uv + diagonal, uv_min, uv_max) * 0.03;
    mask += bounded_text_mask(input.uv - diagonal, uv_min, uv_max) * 0.03;
    mask += bounded_text_mask(input.uv + vec2<f32>(diagonal.x, -diagonal.y), uv_min, uv_max) * 0.03;
    mask += bounded_text_mask(input.uv + vec2<f32>(-diagonal.x, diagonal.y), uv_min, uv_max) * 0.03;
    return vec4<f32>(input.color.rgb, input.color.a * mask);
}
"#;
