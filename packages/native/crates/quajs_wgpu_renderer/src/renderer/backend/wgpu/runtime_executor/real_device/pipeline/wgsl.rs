/// Backdrop blur samples the preceding paint in its backdrop root with a
/// two-dimensional Gaussian, then blends the result over the quad.
///
/// Vertex layout is identical to every other pass (position + uv + color +
/// effect0..2).  `effect0.x` carries the blur radius in **physical pixels**.
/// The backdrop texture UVs are derived from `@builtin(position)` so the
/// sample always reads the matching screen pixel regardless of the quad's own
/// vertex UVs.
pub(super) const BACKDROP_BLUR_WGSL: &str = r#"
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) uv:       vec2<f32>,
    @location(2) color:    vec4<f32>,
    @location(3) effect0:  vec4<f32>,
    @location(4) effect1:  vec4<f32>,
    @location(5) effect2:  vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv:      vec2<f32>,
    @location(1) color:   vec4<f32>,
    @location(2) effect0: vec4<f32>,
};

struct FrameUniforms {
    target_size: vec2<f32>,
    _padding:    vec2<f32>,
};

@group(0) @binding(0)
var<uniform> frame: FrameUniforms;

@group(1) @binding(0)
var backdrop_sampler: sampler;

@group(1) @binding(1)
var backdrop_texture: texture_2d<f32>;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let clip = vec2<f32>(
        (input.position.x / max(frame.target_size.x, 1.0)) * 2.0 - 1.0,
        1.0 - (input.position.y / max(frame.target_size.y, 1.0)) * 2.0,
    );
    output.position = vec4<f32>(clip, 0.0, 1.0);
    output.uv      = input.uv;
    output.color   = input.color;
    output.effect0 = input.effect0;
    return output;
}

// Bilinear-safe single-axis Gaussian: 5-tap kernel with weights
//   [0.0625, 0.25, 0.375, 0.25, 0.0625]  (σ ≈ 0.85 · radius)
// Two passes (horizontal + vertical) give a full 2-D Gaussian approximation.
fn gaussian5(
    tex: texture_2d<f32>,
    smp: sampler,
    uv: vec2<f32>,
    step: vec2<f32>,
) -> vec4<f32> {
    var c = vec4<f32>(0.0);
    c += textureSample(tex, smp, uv - step * 2.0) * 0.0625;
    c += textureSample(tex, smp, uv - step)       * 0.25;
    c += textureSample(tex, smp, uv)               * 0.375;
    c += textureSample(tex, smp, uv + step)       * 0.25;
    c += textureSample(tex, smp, uv + step * 2.0) * 0.0625;
    return c;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Derive backdrop UVs from screen-space fragment position so this command
    // always reads the pixel directly behind it regardless of the vertex UVs.
    let screen_uv = input.position.xy / max(frame.target_size, vec2<f32>(1.0));

    let radius = max(input.effect0.x, 0.0);
    let tex_size = vec2<f32>(textureDimensions(backdrop_texture));
    // CSS filter blur uses sigma = radius. This binomial kernel has unit
    // variance, so adjacent taps are one sigma apart.
    let step_x = vec2<f32>(radius / max(tex_size.x, 1.0), 0.0);
    let step_y = vec2<f32>(0.0, radius / max(tex_size.y, 1.0));

    // Two-pass separable Gaussian via manual horizontal then vertical taps.
    var blurred = vec4<f32>(0.0);
    blurred += gaussian5(backdrop_texture, backdrop_sampler, screen_uv - step_y * 2.0, step_x) * 0.0625;
    blurred += gaussian5(backdrop_texture, backdrop_sampler, screen_uv - step_y,       step_x) * 0.25;
    blurred += gaussian5(backdrop_texture, backdrop_sampler, screen_uv,                step_x) * 0.375;
    blurred += gaussian5(backdrop_texture, backdrop_sampler, screen_uv + step_y,       step_x) * 0.25;
    blurred += gaussian5(backdrop_texture, backdrop_sampler, screen_uv + step_y * 2.0, step_x) * 0.0625;

    // Modulate by the command opacity (stored in vertex color.a) so presence
    // transitions work the same way they do for other Safe-plane draws.
    return vec4<f32>(blurred.rgb / max(blurred.a, 0.00001), blurred.a * input.color.a);
}
"#;

pub(super) const SOLID_COLOR_WGSL: &str = r#"
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) color: vec4<f32>,
    @location(3) effect0: vec4<f32>,
    @location(4) effect1: vec4<f32>,
    @location(5) effect2: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) effect0: vec4<f32>,
    @location(3) effect1: vec4<f32>,
    @location(4) effect2: vec4<f32>,
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
    output.effect2 = input.effect2;
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

// CSS interpolates gradient stops in premultiplied sRGB. The pipeline uses
// straight-alpha source-over, so unpremultiply only after interpolation.
fn gradient_mix(start: vec4<f32>, end: vec4<f32>, progress: f32) -> vec4<f32> {
    let alpha = mix(start.a, end.a, progress);
    let rgb = mix(start.rgb * start.a, end.rgb * end.a, progress);
    return vec4<f32>(rgb / max(alpha, 0.000001), alpha);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Gradient UVs are pre-warped on the CPU for linear/circle geometry.
    // effect2 carries [stopStart, stopEnd, fillsBefore, fillsAfter]. Adjacent
    // multi-stop draws discard outside their own interval, so translucent
    // segments do not overpaint one another.
    let gradient_mode = input.effect1.w;
    if (gradient_mode > 3.5 && gradient_mode < 4.5) {
        let global_progress = dot(input.uv - vec2<f32>(0.5), input.effect1.xy) + input.effect1.z;
        if (global_progress < input.effect2.x && input.effect2.z < 0.5) {
            discard;
        }
        if (global_progress >= input.effect2.y && input.effect2.w < 0.5) {
            discard;
        }
        let progress = clamp(
            (global_progress - input.effect2.x) / max(input.effect2.y - input.effect2.x, 0.000001),
            0.0,
            1.0,
        );
        return gradient_mix(input.color, input.effect0, progress);
    }
    if (gradient_mode > 4.5) {
        let global_progress = distance(input.uv, input.effect1.xy) * input.effect1.z;
        if (global_progress < input.effect2.x && input.effect2.z < 0.5) {
            discard;
        }
        if (global_progress >= input.effect2.y && input.effect2.w < 0.5) {
            discard;
        }
        let progress = clamp(
            (global_progress - input.effect2.x) / max(input.effect2.y - input.effect2.x, 0.000001),
            0.0,
            1.0,
        );
        return gradient_mix(input.color, input.effect0, progress);
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
    @location(5) effect2: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) effect0: vec4<f32>,
    @location(3) effect1: vec4<f32>,
    @location(4) effect2: vec4<f32>,
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
    output.effect2 = input.effect2;
    return output;
}

// CSS hue-rotate matrix (W3C SVG filter spec).
fn hue_rotate(rgb: vec3<f32>, radians: f32) -> vec3<f32> {
    let c = cos(radians);
    let s = sin(radians);
    let r = dot(rgb, vec3<f32>(
        0.213 + c * 0.787 - s * 0.213,
        0.715 - c * 0.715 - s * 0.715,
        0.072 - c * 0.072 + s * 0.928));
    let g = dot(rgb, vec3<f32>(
        0.213 - c * 0.213 + s * 0.143,
        0.715 + c * 0.285 + s * 0.140,
        0.072 - c * 0.072 - s * 0.283));
    let b = dot(rgb, vec3<f32>(
        0.213 - c * 0.213 - s * 0.787,
        0.715 - c * 0.715 + s * 0.715,
        0.072 + c * 0.928 + s * 0.072));
    return vec3<f32>(r, g, b);
}

// CSS sepia matrix.
fn sepia(rgb: vec3<f32>, amount: f32) -> vec3<f32> {
    let r = dot(rgb, vec3<f32>(0.393, 0.769, 0.189));
    let g = dot(rgb, vec3<f32>(0.349, 0.686, 0.168));
    let b = dot(rgb, vec3<f32>(0.272, 0.534, 0.131));
    return mix(rgb, vec3<f32>(r, g, b), amount);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    var sample = textureSample(texture_source, texture_sampler, input.uv);
    if (input.effect2.z > 0.0 && input.effect2.w > 0.0) {
        // A sliced image/atlas frame owns only these texels. Full-texture mip
        // levels contain neighboring frames, so sample its clamped base level.
        sample = textureSampleLevel(texture_source, texture_sampler, clamp(input.uv, input.effect2.xy, input.effect2.zw), 0.0);
    }
    if (input.effect1.x > 0.5) {
        var rgb = sample.rgb;
        // effect0: [brightness, saturation, contrast, grayscale]
        // effect1: [activation, sepia_amount, hue_rotate_radians, invert]
        let brightness    = max(input.effect0.x, 0.0);
        let saturation    = max(input.effect0.y, 0.0);
        let contrast      = max(input.effect0.z, 0.0);
        let grayscale_amt = clamp(input.effect0.w, 0.0, 1.0);
        let sepia_amt     = clamp(input.effect1.y, 0.0, 1.0);
        let hue_rad       = input.effect1.z;
        let invert_amt    = clamp(input.effect1.w, 0.0, 1.0);

        // 1. Invert
        rgb = mix(rgb, 1.0 - rgb, invert_amt);
        // 2. Grayscale
        let lum = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
        rgb = mix(rgb, vec3<f32>(lum), grayscale_amt);
        // 3. Sepia
        rgb = sepia(rgb, sepia_amt);
        // 4. Hue-rotate (skip if near identity to avoid trig cost)
        if (abs(hue_rad) > 0.001) {
            rgb = hue_rotate(rgb, hue_rad);
        }
        // 5. Saturate
        let lum2 = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
        rgb = mix(vec3<f32>(lum2), rgb, saturation);
        // 6. Brightness
        rgb = rgb * brightness;
        // 7. Contrast: (rgb - 0.5) * contrast + 0.5
        rgb = clamp((rgb - vec3<f32>(0.5)) * contrast + vec3<f32>(0.5), vec3<f32>(0.0), vec3<f32>(1.0));

        return vec4<f32>(rgb, sample.a) * input.color;
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
    if (input.effect0.x < -0.5) {
        return input.color;
    }
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
