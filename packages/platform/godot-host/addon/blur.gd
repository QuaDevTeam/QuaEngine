extends RefCounted

const SHADER = preload("res://addons/quaengine/blur.gdshader")
var targets: Array[SubViewport] = []

func clear() -> void:
	for target in targets:
		if is_instance_valid(target): target.queue_free()
	targets.clear()

func render(parent: Node, source: Texture2D, logical_size: Vector2, radius: float) -> Texture2D:
	clear()
	var original := Vector2(source.get_size())
	var extent := Vector2i(source.get_size())
	var sigma := Vector2(radius, radius) * original / logical_size.max(Vector2.ONE)
	var input := source
	var premultiply := true
	while maxf(sigma.x, sigma.y) > 8.0 and extent != Vector2i.ONE:
		var next := Vector2i(maxi(1, ceili(extent.x / 2.0)), maxi(1, ceili(extent.y / 2.0)))
		input = _pass(parent, input, next, Vector2.ZERO, 0.0, premultiply)
		sigma *= Vector2(next) / Vector2(extent)
		extent = next
		premultiply = false
	input = _pass(parent, input, extent, Vector2.RIGHT, sigma.x, premultiply)
	return _pass(parent, input, extent, Vector2.DOWN, sigma.y, false)

func _pass(parent: Node, source: Texture2D, extent: Vector2i, direction: Vector2, sigma: float, premultiply: bool) -> Texture2D:
	var target := SubViewport.new()
	target.size = extent
	target.disable_3d = true
	target.transparent_bg = true
	target.render_target_update_mode = SubViewport.UPDATE_ONCE
	parent.add_child(target)
	targets.append(target)
	var quad := TextureRect.new()
	quad.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	quad.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	quad.size = Vector2(extent)
	quad.texture = source
	var material := ShaderMaterial.new()
	material.shader = SHADER
	material.set_shader_parameter("direction", direction)
	material.set_shader_parameter("sigma", sigma)
	material.set_shader_parameter("premultiply", premultiply)
	quad.material = material
	target.add_child(quad)
	return target.get_texture()
