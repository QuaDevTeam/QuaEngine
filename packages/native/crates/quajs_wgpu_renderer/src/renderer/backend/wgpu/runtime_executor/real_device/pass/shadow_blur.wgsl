@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linear_sampler: sampler;
struct BlurStyle { width: f32, height: f32, dx: f32, dy: f32, sigma: f32, pad0: f32, pad1: f32, pad2: f32 }
@group(0) @binding(2) var<uniform> style: BlurStyle;

@vertex fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
    let positions = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
    return vec4(positions[index], 0.0, 1.0);
}
fn alpha(uv: vec2<f32>) -> f32 {
    if (any(uv < vec2(0.0)) || any(uv > vec2(1.0))) { return 0.0; }
    return textureSampleLevel(source, linear_sampler, uv, 0.0).a;
}
@fragment fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let size = vec2(style.width, style.height);
    let uv = position.xy / size;
    // Half-size linear sampling averages each 2x2 block before large blurs.
    if (style.sigma < 0.001) { return vec4(alpha(uv)); }
    let radius = i32(ceil(style.sigma * 3.0));
    let direction = vec2(style.dx, style.dy) / size;
    var sum = 0.0;
    var weight = 0.0;
    for (var offset = -radius; offset <= radius; offset++) {
        let x = f32(offset) / style.sigma;
        let w = exp(-0.5 * x * x);
        sum += alpha(uv + direction * f32(offset)) * w;
        weight += w;
    }
    return vec4(sum / weight);
}
