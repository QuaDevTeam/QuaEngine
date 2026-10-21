shader_type canvas_item;
render_mode unshaded;
uniform float brightness = 1.0;
uniform float contrast = 1.0;
uniform float saturation = 1.0;
uniform float grayscale = 0.0;
uniform float sepia = 0.0;
uniform float hue = 0.0;
uniform bool premultiplied = false;
uniform bool use_mask = false;
uniform bool mask_luminance = false;
uniform sampler2D mask_texture : filter_linear;
uniform vec3 ambient = vec3(1.0);
uniform vec4 shade_color = vec4(0.0);
uniform vec2 shade_from = vec2(0.0);
uniform vec2 shade_to = vec2(0.0, 1.0);
varying vec4 modulation;
void vertex() { modulation = COLOR; }
void fragment() {
	vec4 sampled = texture(TEXTURE, UV);
	if (premultiplied) sampled.rgb = sampled.a > 0.00001 ? sampled.rgb / sampled.a : vec3(0.0);
	sampled *= modulation;
	if (use_mask) {
		vec4 mask = texture(mask_texture, UV);
		sampled.a *= mask.a * (mask_luminance ? dot(mask.rgb, vec3(0.2126, 0.7152, 0.0722)) : 1.0);
	}
	vec3 rgb = sampled.rgb * brightness;
	rgb = (rgb - 0.5) * contrast + 0.5;
	float lum = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
	rgb = mix(vec3(lum), rgb, saturation * (1.0 - grayscale));
	vec3 warm = vec3(dot(rgb, vec3(0.393, 0.769, 0.189)), dot(rgb, vec3(0.349, 0.686, 0.168)), dot(rgb, vec3(0.272, 0.534, 0.131)));
	rgb = mix(rgb, warm, sepia);
	vec3 axis = normalize(vec3(1.0));
	rgb = rgb * cos(hue) + cross(axis, rgb) * sin(hue) + axis * dot(axis, rgb) * (1.0 - cos(hue));
	vec2 direction = shade_to - shade_from;
	float shade = clamp(dot(UV - shade_from, direction) / max(dot(direction, direction), 0.00001), 0.0, 1.0);
	rgb = mix(rgb * ambient, shade_color.rgb, shade_color.a * shade);
	COLOR = vec4(clamp(rgb, 0.0, 1.0), sampled.a);
}
