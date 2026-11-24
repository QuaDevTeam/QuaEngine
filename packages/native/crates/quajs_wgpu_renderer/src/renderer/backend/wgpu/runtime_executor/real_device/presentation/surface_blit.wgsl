@group(0) @binding(0) var scene: texture_2d<f32>;
override linear_output: bool = false;
override hdr_output: bool = false;
override straight_alpha: bool = false;
override premultiplied_alpha: bool = false;
override white_scale: f32 = 1.0;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
    let xy = array<vec2f, 3>(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
    return vec4f(xy[i], 0., 1.);
}

@fragment fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f {
    let sample = textureLoad(scene, vec2i(p.xy), 0);
    var rgb = sample.rgb;
    // Opaque windows flatten the premultiplied scene over its black clear.
    // Transparent HDR output must convert straight RGB before repremultiplying.
    if straight_alpha || (hdr_output && premultiplied_alpha) {
        rgb = clamp(rgb / max(sample.a, 1.0 / 255.0), vec3f(0.), vec3f(1.));
    }
    if linear_output {
        rgb = select(pow((rgb + 0.055) / 1.055, vec3f(2.4)), rgb / 12.92, rgb <= vec3f(0.04045));
    }
    if hdr_output && premultiplied_alpha {
        rgb *= sample.a;
    }
    return vec4f(rgb * white_scale, sample.a);
}
