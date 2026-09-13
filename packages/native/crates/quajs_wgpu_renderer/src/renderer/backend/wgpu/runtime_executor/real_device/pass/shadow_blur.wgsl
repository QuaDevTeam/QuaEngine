@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linear_sampler: sampler;
struct BlurStyle { width: f32, height: f32, dx: f32, dy: f32, sigma: f32, color_mode: f32, pad1: f32, pad2: f32 }
@group(0) @binding(2) var<uniform> style: BlurStyle;

@vertex fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
    let positions = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
    return vec4(positions[index], 0.0, 1.0);
}
fn pixel(uv: vec2<f32>) -> vec4<f32> {
    if (style.color_mode > 0.5) { return textureSampleLevel(source, linear_sampler, uv, 0.0); }
    if (any(uv < vec2(0.0)) || any(uv > vec2(1.0))) { return vec4(0.0); }
    return vec4(textureSampleLevel(source, linear_sampler, uv, 0.0).a);
}
@fragment fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let size = vec2(style.width, style.height);
    let uv = position.xy / size;
    // Half-size linear sampling averages each 2x2 block before large blurs.
    if (style.sigma < 0.001) { return pixel(uv); }
    let radius = i32(ceil(style.sigma * 3.0));
    let direction = vec2(style.dx, style.dy) / size;
    var sum = vec4(0.0);
    var weight = 0.0;
    for (var offset = -radius; offset <= radius; offset++) {
        let x = f32(offset) / style.sigma;
        let w = exp(-0.5 * x * x);
        sum += pixel(uv + direction * f32(offset)) * w;
        weight += w;
    }
    return sum / weight;
}
