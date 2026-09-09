@group(0) @binding(0) var source: texture_2d<f32>;
struct CompositeStyle {
    opacity: f32, blur_radius: f32, blend_mode: f32,
    brightness: f32, contrast: f32, saturation: f32,
    hue: f32, grayscale: f32, sepia: f32, invert: f32,
    mask_enabled: f32, mask_mode: f32,
    mask_x: f32, mask_y: f32, mask_width: f32, mask_height: f32,
    tile_x: f32, tile_y: f32, tile_width: f32, tile_height: f32,
    period_x: f32, period_y: f32, repeat_x: f32, repeat_y: f32,
    rotation_cos: f32, rotation_sin: f32,
    shadow_enabled: f32, shadow_sigma: f32, shadow_x: f32, shadow_y: f32,
    shadow_r: f32, shadow_g: f32, shadow_b: f32, shadow_a: f32,
    inverse_a: f32, inverse_b: f32, inverse_c: f32, inverse_d: f32, inverse_x: f32, inverse_y: f32,
}
@group(0) @binding(1) var<uniform> style: CompositeStyle;
@group(0) @binding(2) var backdrop: texture_2d<f32>;
@group(0) @binding(3) var mask_texture: texture_2d<f32>;
@group(0) @binding(4) var shadow_texture: texture_2d<f32>;

@vertex fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
    let positions = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
    return vec4(positions[index], 0.0, 1.0);
}

fn source_pixel(position: vec2<f32>) -> vec4<f32> {
    if (any(position < vec2(0.0)) || any(position >= vec2<f32>(textureDimensions(source)))) {
        return vec4(0.0);
    }
    let p = position - 0.5;
    let origin = floor(p);
    let weight = fract(p);
    if (all(weight < vec2(0.0001))) { return textureLoad(source, vec2<i32>(origin), 0); }
    let a = vec2<i32>(origin);
    return mix(mix(textureLoad(source, a, 0), textureLoad(source, a + vec2(1,0), 0), weight.x),
               mix(textureLoad(source, a + vec2(0,1), 0), textureLoad(source, a + vec2(1,1), 0), weight.x), weight.y);
}

// Uploaded RGB is premultiplied; luminance already includes alpha.
// Transparent RGB must contribute nothing, including in luminance mode.
fn mask_texel(point: vec2<i32>, level: i32) -> f32 {
    let texel = textureLoad(mask_texture, clamp(point, vec2(0), vec2<i32>(textureDimensions(mask_texture, level)) - 1), level);
    if (style.mask_mode > 0.5) { return dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722)); }
    return texel.a;
}
fn mask_sample(uv: vec2<f32>, level: i32) -> f32 {
    let texel = uv * vec2<f32>(textureDimensions(mask_texture, level)) - 0.5;
    let base = vec2<i32>(floor(texel));
    let weight = fract(texel);
    return mix(mix(mask_texel(base, level), mask_texel(base + vec2(1, 0), level), weight.x),
               mix(mask_texel(base + vec2(0, 1), level), mask_texel(base + vec2(1, 1), level), weight.x), weight.y);
}
fn mask_alpha(position: vec2<f32>) -> f32 {
    if (style.mask_enabled < 0.5) { return 1.0; }
    let area = vec2(style.mask_width, style.mask_height);
    let size = vec2(style.tile_width, style.tile_height);
    if (any(area <= vec2(0.0)) || any(size <= vec2(0.0))) { return 0.0; }
    let center = vec2(style.mask_x, style.mask_y) + area * 0.5;
    let delta = position - center;
    let point = center + vec2(delta.x * style.rotation_cos + delta.y * style.rotation_sin,
                             delta.y * style.rotation_cos - delta.x * style.rotation_sin);
    let local = point - vec2(style.mask_x, style.mask_y);
    if (any(local < vec2(0.0)) || any(local >= area)) { return 0.0; }
    var tile = point - vec2(style.tile_x, style.tile_y);
    let period = max(vec2(style.period_x, style.period_y), vec2(0.000001));
    if (style.repeat_x > 0.5) { tile.x -= floor(tile.x / period.x) * period.x; }
    if (style.repeat_y > 0.5) { tile.y -= floor(tile.y / period.y) * period.y; }
    // Space gaps and no-repeat regions are transparent, never edge-stretched.
    if (any(tile < vec2(0.0)) || any(tile >= size)) { return 0.0; }
    // Match Chrome raster masks' bilinear sampling of the original image.
    return mask_sample(tile / size, 0);
}

fn filtered_pixel(position: vec2<f32>) -> vec4<f32> {
    var pixel = source_pixel(position);
    if (style.blur_radius >= 0.001) {
        var sum = vec4<f32>(0.0);
        var weight = 0.0;
        // CSS blur uses sigma. Average premultiplied pixels before color filters.
        for (var y = -4; y <= 4; y++) {
            for (var x = -4; x <= 4; x++) {
                let offset = vec2<f32>(f32(x), f32(y)) * 0.8;
                let w = exp(-0.5 * dot(offset, offset));
                sum += source_pixel(position + offset * style.blur_radius) * w;
                weight += w;
            }
        }
        pixel = sum / weight;
    }
    if (pixel.a <= 0.0) { return vec4(0.0); }
    var rgb = pixel.rgb / pixel.a;
    rgb = clamp(rgb * style.brightness, vec3(0.0), vec3(1.0));
    rgb = clamp((rgb - 0.5) * style.contrast + 0.5, vec3(0.0), vec3(1.0));
    let sat_lum = dot(rgb, vec3(0.213, 0.715, 0.072));
    rgb = clamp(mix(vec3(sat_lum), rgb, style.saturation), vec3(0.0), vec3(1.0));
    let c = cos(style.hue);
    let s = sin(style.hue);
    rgb = clamp(vec3(
        dot(rgb, vec3(0.213 + 0.787*c - 0.213*s, 0.715 - 0.715*c - 0.715*s, 0.072 - 0.072*c + 0.928*s)),
        dot(rgb, vec3(0.213 - 0.213*c + 0.143*s, 0.715 + 0.285*c + 0.140*s, 0.072 - 0.072*c - 0.283*s)),
        dot(rgb, vec3(0.213 - 0.213*c - 0.787*s, 0.715 - 0.715*c + 0.715*s, 0.072 + 0.928*c + 0.072*s))
    ), vec3(0.0), vec3(1.0));
    rgb = mix(rgb, vec3(dot(rgb, vec3(0.2126, 0.7152, 0.0722))), style.grayscale);
    rgb = clamp(mix(rgb, vec3(
        dot(rgb, vec3(0.393, 0.769, 0.189)),
        dot(rgb, vec3(0.349, 0.686, 0.168)),
        dot(rgb, vec3(0.272, 0.534, 0.131))
    ), style.sepia), vec3(0.0), vec3(1.0));
    rgb = mix(rgb, 1.0 - rgb, style.invert);
    return vec4(rgb * pixel.a, pixel.a);
}

fn shadow_texel(point: vec2<i32>) -> f32 {
    if (any(point < vec2(0)) || any(point >= vec2<i32>(textureDimensions(shadow_texture)))) { return 0.0; }
    return textureLoad(shadow_texture, point, 0).a;
}
fn shadow_alpha(position: vec2<f32>) -> f32 {
    let uv = (position - vec2(style.shadow_x, style.shadow_y)) / vec2<f32>(textureDimensions(source));
    let texel = uv * vec2<f32>(textureDimensions(shadow_texture)) - 0.5;
    let base = vec2<i32>(floor(texel));
    let weight = fract(texel);
    return mix(mix(shadow_texel(base), shadow_texel(base + vec2(1, 0)), weight.x),
               mix(shadow_texel(base + vec2(0, 1)), shadow_texel(base + vec2(1, 1)), weight.x), weight.y);
}

// W3C Compositing and Blending Level 1 non-separable modes.
fn lum(c: vec3<f32>) -> f32 { return dot(c, vec3(0.3, 0.59, 0.11)); }
fn sat(c: vec3<f32>) -> f32 { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }
fn set_lum(color: vec3<f32>, l: f32) -> vec3<f32> {
    var c = color + (l - lum(color));
    let n = min(c.r, min(c.g, c.b));
    let x = max(c.r, max(c.g, c.b));
    if (n < 0.0) { c = l + (c - l) * l / max(l - n, 0.000001); }
    if (x > 1.0) { c = l + (c - l) * (1.0 - l) / max(x - l, 0.000001); }
    return c;
}
fn set_sat(c: vec3<f32>, s: f32) -> vec3<f32> {
    let range = sat(c);
    if (range <= 0.0) { return vec3(0.0); }
    return (c - min(c.r, min(c.g, c.b))) * s / range;
}
fn channel_blend(b: f32, s: f32, mode: u32) -> f32 {
    switch mode {
        case 1u: { return b * s; }
        case 2u: { return b + s - b*s; }
        case 3u: {
            if (b <= 0.5) { return 2.0*b*s; }
            return 1.0 - 2.0*(1.0-b)*(1.0-s);
        }
        case 4u: { return min(b, s); }
        case 5u: { return max(b, s); }
        case 6u: {
            if (b == 0.0) { return 0.0; }
            if (s == 1.0) { return 1.0; }
            return min(1.0, b / (1.0-s));
        }
        case 7u: {
            if (b == 1.0) { return 1.0; }
            if (s == 0.0) { return 0.0; }
            return 1.0 - min(1.0, (1.0-b)/s);
        }
        case 8u: {
            if (s <= 0.5) { return 2.0*b*s; }
            return 1.0 - 2.0*(1.0-b)*(1.0-s);
        }
        case 9u: {
            if (s <= 0.5) { return b - (1.0-2.0*s)*b*(1.0-b); }
            var d = sqrt(b);
            if (b <= 0.25) { d = ((16.0*b-12.0)*b+4.0)*b; }
            return b + (2.0*s-1.0)*(d-b);
        }
        case 10u: { return abs(b-s); }
        case 11u: { return b+s-2.0*b*s; }
        default: { return s; }
    }
}
fn blend(b: vec3<f32>, s: vec3<f32>, mode: u32) -> vec3<f32> {
    switch mode {
        case 12u: { return set_lum(set_sat(s, sat(b)), lum(b)); }
        case 13u: { return set_lum(set_sat(b, sat(s)), lum(b)); }
        case 14u: { return set_lum(s, lum(b)); }
        case 15u: { return set_lum(b, lum(s)); }
        default: { return vec3(channel_blend(b.r,s.r,mode), channel_blend(b.g,s.g,mode), channel_blend(b.b,s.b,mode)); }
    }
}

@fragment fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let point = vec2(style.inverse_a * position.x + style.inverse_c * position.y + style.inverse_x,
                     style.inverse_b * position.x + style.inverse_d * position.y + style.inverse_y);
    var pixel = filtered_pixel(point);
    if (style.shadow_enabled > 0.5 && style.shadow_a > 0.0) {
        let alpha = shadow_alpha(point) * style.shadow_a;
        let shadow = vec4(vec3(style.shadow_r, style.shadow_g, style.shadow_b) * alpha, alpha);
        pixel += shadow * (1.0 - pixel.a);
    }
    let masked = pixel * (style.opacity * mask_alpha(point));
    if (style.blend_mode == 0.0 || masked.a <= 0.0) { return masked; }
    let back = textureLoad(backdrop, vec2<i32>(position.xy), 0);
    let cb = back.rgb / max(back.a, 0.000001);
    let cs = masked.rgb / max(masked.a, 0.000001);
    // Fixed-function premultiplied source-over adds backdrop*(1-source alpha).
    return vec4(masked.a * mix(cs, blend(cb, cs, u32(style.blend_mode)), back.a), masked.a);
}
