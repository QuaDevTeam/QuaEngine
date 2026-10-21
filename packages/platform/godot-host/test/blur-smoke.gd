extends Control

const ProjectionNode = preload("res://addons/quaengine/scene_node.gd")
var projection_shader = preload("res://addons/quaengine/projection.gdshader")
var resources: Dictionary = {}

func parse_color(value: String) -> Color: return Color(value)
func warn_once(_key: String, message: String) -> void: push_error(message)

func _ready() -> void:
	var source := Image.create(640, 360, false, Image.FORMAT_RGBA8)
	source.fill(Color.BLACK)
	source.fill_rect(Rect2i(317, 177, 6, 6), Color.WHITE)
	for x in [80, 100, 200, 440, 560]: source.fill_rect(Rect2i(x, 60, 2, 240), Color.WHITE)
	source.save_png("res://input.png")
	var texture := ImageTexture.create_from_image(source)
	for radius in [4.0, 12.0, 32.0, 64.0]:
		for stage_scale in [0.5, 1.0]:
			var node = ProjectionNode.new()
			node.host = self
			add_child(node)
			# Logical dimensions differ while the displayed source remains 640x360.
			node.apply_transform({"width": 640 / stage_scale, "height": 360 / stage_scale, "scaleX": stage_scale, "scaleY": stage_scale})
			node.apply_sprite(texture, {"filter": {"blur": radius}})
			for frame in range(4): await RenderingServer.frame_post_draw
			get_viewport().get_texture().get_image().save_png("res://godot-%s-%s.png" % [int(radius), stage_scale])
			node.queue_free()
			await RenderingServer.frame_post_draw
			if get_child_count() != 0:
				push_error("Blur targets survived node teardown")
				get_tree().quit(1)
				return
	get_tree().quit()
