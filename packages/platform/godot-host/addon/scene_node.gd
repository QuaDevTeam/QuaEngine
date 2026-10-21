extends Control

const GaussianBlur = preload("res://addons/quaengine/blur.gd")
var blur_passes = GaussianBlur.new()
var projection_id := ""
var projection_kind := ""
var projection_metadata: Dictionary = {}
var projection_transform: Dictionary = {}
var text_node: Label
var image_node: Control
var video_node: VideoStreamPlayer
var box_style: Dictionary = {}
var gradient_texture: GradientTexture2D
var text_value := ""
var text_style: Dictionary = {}
var text_rich := false
var host: Node

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func apply_transform(value: Dictionary) -> void:
	projection_transform.merge(value, true)
	var t := projection_transform
	position = Vector2(float(t.get("x", 0)), float(t.get("y", 0)))
	size = Vector2(maxf(0, float(t.get("width", 0))), maxf(0, float(t.get("height", 0))))
	pivot_offset = Vector2(float(t.get("anchorX", 0)), float(t.get("anchorY", 0))) * size
	scale = Vector2(float(t.get("scaleX", 1)), float(t.get("scaleY", 1)))
	rotation_degrees = float(t.get("rotation", 0))
	modulate.a = float(t.get("opacity", 1))
	z_index = clampi(int(t.get("zIndex", 0)), -4096, 4096)
	clip_contents = t.get("clip") != null
	if is_instance_valid(text_node):
		_layout_text()
	if is_instance_valid(image_node):
		image_node.size = size
	if is_instance_valid(video_node):
		video_node.size = size
	queue_redraw()

func apply_text(value: String, style: Dictionary, rich: bool = false) -> void:
	text_value = value
	text_style = style
	text_rich = rich
	if not is_instance_valid(text_node):
		text_node = Label.new()
		text_node.mouse_filter = Control.MOUSE_FILTER_IGNORE
		text_node.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		text_node.clip_text = true
		add_child(text_node)
	# Scene renderer's rich text is a portable projection, never interpreted as code.
	if rich:
		var expression := RegEx.new()
		expression.compile("<[^>]*>")
		value = expression.sub(value, "", true)
	text_node.text = value
	_layout_text()
	var font: Font = host.resolve_font(style)
	var font_size := int(style.get("fontSize", 24))
	text_node.add_theme_font_override("font", font)
	text_node.add_theme_font_size_override("font_size", font_size)
	text_node.add_theme_color_override("font_color", host.parse_color(style.get("color", "#ffffff")))
	var line_height := float(style.get("lineHeight", font.get_height(font_size)))
	text_node.add_theme_constant_override("line_spacing", int(line_height - font.get_height(font_size)))
	text_node.horizontal_alignment = {"left": HORIZONTAL_ALIGNMENT_LEFT, "center": HORIZONTAL_ALIGNMENT_CENTER, "right": HORIZONTAL_ALIGNMENT_RIGHT}.get(style.get("align", "left"), HORIZONTAL_ALIGNMENT_LEFT)
	text_node.vertical_alignment = {"top": VERTICAL_ALIGNMENT_TOP, "center": VERTICAL_ALIGNMENT_CENTER, "bottom": VERTICAL_ALIGNMENT_BOTTOM}.get(style.get("verticalAlign", "top"), VERTICAL_ALIGNMENT_TOP)

func _layout_text() -> void:
	var padding: Dictionary = text_style.get("padding", {})
	text_node.position = Vector2(float(padding.get("left", 0)), float(padding.get("top", 0)))
	text_node.size = (size - text_node.position - Vector2(float(padding.get("right", 0)), float(padding.get("bottom", 0)))).max(Vector2.ZERO)

func apply_sprite(resource: Resource, options: Dictionary) -> void:
	blur_passes.clear()
	if is_instance_valid(image_node): image_node.hide()
	if is_instance_valid(video_node):
		video_node.hide()
		if not resource is VideoStream: video_node.stop()
	if resource is VideoStream:
		if not is_instance_valid(video_node):
			video_node = VideoStreamPlayer.new()
			video_node.mouse_filter = Control.MOUSE_FILTER_IGNORE
			video_node.expand = true
			add_child(video_node)
		var video: Dictionary = options.get("video", {})
		video_node.show()
		var changed := video_node.stream != resource
		if changed: video_node.stream = resource
		video_node.size = size
		video_node.loop = video.get("loop", true)
		video_node.volume = 0 if video.get("muted", true) else float(video.get("volume", 1))
		video_node.speed_scale = float(video.get("playbackRate", 1))
		if changed: video_node.play()
		if video.has("seekMs") or (changed and video.has("offsetMs")):
			video_node.stream_position = float(video.get("seekMs", video.get("offsetMs", 0))) / 1000.0
		return
	var texture: Texture2D = resource as Texture2D
	var sliced: bool = options.get("mode") == "sliced"
	if is_instance_valid(image_node) and (image_node is NinePatchRect) != sliced:
		image_node.queue_free()
		image_node = null
	if not is_instance_valid(image_node):
		image_node = NinePatchRect.new() if sliced else TextureRect.new()
		image_node.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if image_node is TextureRect: image_node.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		add_child(image_node)
		move_child(image_node, 0)
	image_node.show()
	image_node.set("texture", texture)
	image_node.size = size
	if image_node is TextureRect:
		image_node.stretch_mode = TextureRect.STRETCH_TILE if options.get("mode", "sprite") == "tiled" else TextureRect.STRETCH_SCALE
	else:
		var slice: Dictionary = options.get("slice", {})
		for side in [["top", SIDE_TOP], ["right", SIDE_RIGHT], ["bottom", SIDE_BOTTOM], ["left", SIDE_LEFT]]:
			image_node.set_patch_margin(side[1], int(slice.get(side[0], 0)))
		image_node.draw_center = options.get("fill", true)
	image_node.modulate = host.parse_color(options.get("tint", "#ffffff"))
	image_node.modulate.a *= float(options.get("opacity", 1))
	var frame: Dictionary = options.get("frame", {})
	if not frame.is_empty() and texture:
		var atlas := AtlasTexture.new()
		atlas.atlas = texture
		atlas.region = Rect2(float(frame.get("x", 0)), float(frame.get("y", 0)), float(frame.get("width", texture.get_width())), float(frame.get("height", texture.get_height())))
		image_node.set("texture", atlas)
	var material := ShaderMaterial.new()
	material.shader = host.projection_shader
	var filters: Dictionary = options.get("filter", options.get("composition", {}).get("filter", {}))
	var radius := maxf(0, float(filters.get("blur", 0)))
	if radius > 0 and texture:
		image_node.set("texture", blur_passes.render(self, image_node.get("texture"), size, radius))
		material.set_shader_parameter("premultiplied", true)
	material.set_shader_parameter("brightness", float(filters.get("brightness", 1)))
	material.set_shader_parameter("contrast", float(filters.get("contrast", 1)))
	material.set_shader_parameter("saturation", float(filters.get("saturate", 1)))
	material.set_shader_parameter("grayscale", float(filters.get("grayscale", 0)))
	material.set_shader_parameter("sepia", float(filters.get("sepia", 0)))
	material.set_shader_parameter("hue", deg_to_rad(float(filters.get("hueRotate", 0))))
	var mask: Dictionary = options.get("mask", options.get("composition", {}).get("mask", {}))
	var mask_texture: Texture2D = host.resources.get(mask.get("resourceId", mask.get("resource", {}).get("id", "")))
	material.set_shader_parameter("use_mask", mask_texture != null)
	if mask_texture:
		material.set_shader_parameter("mask_texture", mask_texture)
		material.set_shader_parameter("mask_luminance", mask.get("mode", "alpha") == "luminance")
	var lighting: Dictionary = options.get("lighting", {})
	var ambient: Array = lighting.get("ambient", [1.0, 1.0, 1.0])
	material.set_shader_parameter("ambient", Vector3(ambient[0], ambient[1], ambient[2]))
	var shade: Dictionary = lighting.get("shade", {})
	var color: Array = shade.get("color", [0.0, 0.0, 0.0, 0.0])
	material.set_shader_parameter("shade_color", Vector4(color[0], color[1], color[2], color[3] if color.size() > 3 else 0.0))
	var from: Array = shade.get("from", [0.0, 0.0])
	var to: Array = shade.get("to", [0.0, 1.0])
	material.set_shader_parameter("shade_from", Vector2(from[0], from[1]))
	material.set_shader_parameter("shade_to", Vector2(to[0], to[1]))
	image_node.material = material
	for feature in ["dropShadow"]:
		if filters.get(feature):
			host.warn_once("image-filter-" + feature, "Godot image filter is unavailable: " + feature)
	if not mask.is_empty() and not mask_texture:
		host.warn_once("image-mask", "Godot image mask resource is unavailable.")
	var blend: String = options.get("blendMode", options.get("composition", {}).get("blendMode", "normal"))
	if blend != "normal":
		host.warn_once("blend-" + blend, "Godot blend mode is not implemented: " + blend)

func _draw() -> void:
	if box_style.is_empty() or size.x <= 0 or size.y <= 0:
		return
	if box_style.get("shape") in ["chevron-down", "chevron-up"]:
		var up: bool = box_style.get("shape") == "chevron-up"
		var inset := 1.0
		var points := PackedVector2Array([Vector2(inset, size.y - inset if up else inset), Vector2(size.x / 2, inset if up else size.y - inset), Vector2(size.x - inset, size.y - inset if up else inset)])
		draw_polyline(points, host.parse_color(box_style.get("backgroundColor", box_style.get("borderColor", "#ffffff"))), 1.8, true)
		return
	var style := StyleBoxFlat.new()
	style.bg_color = host.parse_color(box_style.get("backgroundColor", "#00000000"))
	style.border_color = host.parse_color(box_style.get("borderColor", "#00000000"))
	style.set_border_width_all(int(box_style.get("borderWidth", 0)))
	style.set_corner_radius_all(int(box_style.get("borderRadius", 0)))
	for side in [["Top", SIDE_TOP], ["Right", SIDE_RIGHT], ["Bottom", SIDE_BOTTOM], ["Left", SIDE_LEFT]]:
		if box_style.has("border" + side[0] + "Width"):
			style.set_border_width(side[1], int(box_style["border" + side[0] + "Width"]))
	var shadow: Dictionary = box_style.get("boxShadow", {})
	if not shadow.is_empty():
		style.shadow_color = host.parse_color(shadow.get("color", "#00000000"))
		style.shadow_offset = Vector2(float(shadow.get("offsetX", 0)), float(shadow.get("offsetY", 0)))
		style.shadow_size = int(float(shadow.get("blurRadius", 0)) / 2)
	draw_style_box(style, Rect2(Vector2.ZERO, size))
	# StyleBoxFlat has one border color; preserve authored per-edge accents.
	for side in ["Top", "Right", "Bottom", "Left"]:
		if not box_style.has("border" + side + "Color"): continue
		var edge_width := float(box_style.get("border" + side + "Width", box_style.get("borderWidth", 0)))
		if edge_width <= 0: continue
		var inset := edge_width / 2.0
		var radius := float(box_style.get("borderRadius", 0))
		var start := Vector2(radius, inset)
		var end := Vector2(size.x - radius, inset)
		if side == "Bottom":
			start.y = size.y - inset
			end.y = size.y - inset
		elif side == "Left" or side == "Right":
			var x := inset if side == "Left" else size.x - inset
			start = Vector2(x, radius)
			end = Vector2(x, size.y - radius)
		draw_line(start, end, host.parse_color(box_style["border" + side + "Color"]), edge_width, true)
	var gradient: Dictionary = box_style.get("backgroundGradient", {})
	if not gradient.is_empty():
		var colors := Gradient.new()
		colors.offsets = PackedFloat32Array()
		colors.colors = PackedColorArray()
		for stop in gradient.get("stops", []):
			colors.add_point(float(stop.get("position", 0)), host.parse_color(stop.get("color", "#00000000")))
		gradient_texture = GradientTexture2D.new()
		var texture := gradient_texture
		texture.gradient = colors
		texture.width = maxi(1, int(size.x))
		texture.height = maxi(1, int(size.y))
		if gradient.get("kind") == "radial":
			texture.fill = GradientTexture2D.FILL_RADIAL
			texture.fill_from = Vector2(float(gradient.get("centerX", 0.5)), float(gradient.get("centerY", 0.5)))
			texture.fill_to = texture.fill_from + Vector2(0.5, 0)
		else:
			var direction := Vector2(sin(deg_to_rad(float(gradient.get("angleDegrees", 180)))), -cos(deg_to_rad(float(gradient.get("angleDegrees", 180))))) * 0.5
			texture.fill_from = Vector2(0.5, 0.5) - direction
			texture.fill_to = Vector2(0.5, 0.5) + direction
		draw_texture_rect(texture, Rect2(Vector2.ZERO, size), false)
