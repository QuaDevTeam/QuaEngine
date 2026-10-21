shader_type canvas_item;
render_mode unshaded, blend_disabled;
uniform vec2 direction = vec2(0.0);
uniform float sigma = 0.0;
uniform bool premultiply = false;

vec4 pixel(sampler2D source, vec2 uv, vec2 texel) {
	vec4 value = texture(source, clamp(uv, texel * 0.5, vec2(1.0) - texel * 0.5));
	if (premultiply) value.rgb *= value.a;
	return value;
}
void fragment() {
	vec4 sum = pixel(TEXTURE, UV, TEXTURE_PIXEL_SIZE);
	float total = 1.0;
	// The host halves the source until sigma <= 8. Every tap is adjacent;
	// increasing blur never spaces taps farther apart and creates ghost grids.
	for (int i = 1; i <= 24; i++) {
		if (float(i) > ceil(sigma * 3.0)) break;
		float weight = exp(-0.5 * pow(float(i) / max(sigma, 0.0001), 2.0));
		vec2 offset = direction * TEXTURE_PIXEL_SIZE * float(i);
		sum += (pixel(TEXTURE, UV - offset, TEXTURE_PIXEL_SIZE) + pixel(TEXTURE, UV + offset, TEXTURE_PIXEL_SIZE)) * weight;
		total += weight * 2.0;
	}
	COLOR = sum / total;
}
