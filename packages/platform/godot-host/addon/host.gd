extends Control

const ProjectionNode = preload("res://addons/quaengine/scene_node.gd")
var projection_shader: Shader = preload("res://addons/quaengine/projection.gdshader")
var vm: RefCounted
var nodes: Dictionary = {}
var resources: Dictionary = {}
var fonts: Dictionary = {}
var media_files: Dictionary = {}
var font_variations: Dictionary = {}
var audio: Dictionary = {}
var events: Array = []
var warnings: Dictionary = {}
var stage: Control
var running := false
var frame_number := 0
var review_dir := ""
var review_busy := false
var frame_times: Array[float] = []
var script_times: Array[float] = []

func _ready() -> void:
	nodes["root"] = self
	get_viewport().size_changed.connect(func(): events.append({"type": "layout"}))
	if not ClassDB.class_exists("QuaJsRuntime"):
		GDExtensionManager.load_extension("res://addons/quaengine/quaengine.gdextension")
	vm = ClassDB.instantiate("QuaJsRuntime")
	if vm == null:
		push_error("QuaEngine Godot GDExtension could not load.")
		get_tree().quit(1)
		return
	var manifest = JSON.parse_string(FileAccess.get_file_as_string("res://target-bundle-manifest.json"))
	if not manifest is Dictionary or manifest.get("target") != "godot" or manifest.get("targetCoreResolver") != "godot-core-resolver":
		push_error("Invalid Godot target-bundle manifest.")
		get_tree().quit(1)
		return
	if manifest.get("profile") == "debug":
		for argument in OS.get_cmdline_user_args():
			if argument.begins_with("--qua-review-dir="):
				review_dir = argument.trim_prefix("--qua-review-dir=")
				DirAccess.make_dir_recursive_absolute(review_dir.path_join("requests"))
				DirAccess.make_dir_recursive_absolute(review_dir.path_join("responses"))
	var source := FileAccess.get_file_as_string("res://qua/runtime.js")
	if source.is_empty():
		push_error("Missing QuaEngine Godot runtime bundle.")
		get_tree().quit(1)
		return
	running = vm.start(source, Callable(self, "bridge"))
	if not running:
		get_tree().quit(1)

func _process(_delta: float) -> void:
	if not running:
		return
	frame_number += 1
	if not review_dir.is_empty():
		frame_times.append(_delta * 1000.0)
		if frame_times.size() > 600: frame_times.pop_front()
	var pending := events
	events = []
	var tick_start := Time.get_ticks_usec()
	running = vm.tick(Time.get_ticks_usec() / 1000.0, JSON.stringify(pending))
	if not review_dir.is_empty():
		script_times.append(float(Time.get_ticks_usec() - tick_start) / 1000.0)
		if script_times.size() > 600: script_times.pop_front()
	if not running:
		push_error(vm.last_error())
		get_tree().quit(1)
	if not review_dir.is_empty() and not review_busy:
		_review_request()

func _exit_tree() -> void:
	running = false
	if vm:
		vm.stop()
	resources.clear()
	for path in media_files.values(): DirAccess.remove_absolute(path)
	media_files.clear()
	fonts.clear()
	font_variations.clear()

func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var point: Vector2 = get_global_transform().affine_inverse() * event.position
		if event.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
			if event.pressed:
				events.append({"kind": "pointer", "phase": "wheel", "x": point.x, "y": point.y, "metadata": {"deltaY": -72 if event.button_index == MOUSE_BUTTON_WHEEL_UP else 72}})
		elif event.button_index == MOUSE_BUTTON_LEFT:
			events.append({"kind": "pointer", "phase": "down" if event.pressed else "up", "x": point.x, "y": point.y})
	elif event is InputEventMouseMotion:
		var point: Vector2 = get_global_transform().affine_inverse() * event.position
		events.append({"kind": "pointer", "phase": "move", "x": point.x, "y": point.y})
	elif event is InputEventKey:
		var code := OS.get_keycode_string(event.physical_keycode)
		var key := OS.get_keycode_string(event.keycode)
		var codes := {"Space": "Space", "Enter": "Enter", "Escape": "Escape", "PageDown": "PageDown", "PageUp": "PageUp", "Left": "ArrowLeft", "Right": "ArrowRight", "Up": "ArrowUp", "Down": "ArrowDown", "Shift": "ShiftLeft", "Ctrl": "ControlLeft"}
		code = codes.get(code, "Key" + code.to_upper() if code.length() == 1 else code)
		events.append({"kind": "keyboard", "phase": "down" if event.pressed else "up", "key": " " if key == "Space" else key, "code": code, "repeat": event.echo})
	elif event is InputEventScreenTouch:
		events.append({"kind": "pointer", "phase": "down" if event.pressed else "up", "x": event.position.x, "y": event.position.y})

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		events.append({"kind": "focus", "phase": "blur"})
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		events.append({"kind": "focus", "phase": "focus"})

func bridge(method: String, raw: String, bytes: PackedByteArray = PackedByteArray()) -> Variant:
	if method == "read_bytes":
		if not _safe_path(raw):
			push_error("Rejected resource path: " + raw)
			return null
		var file := FileAccess.open(raw, FileAccess.READ)
		return file.get_buffer(file.get_length()) if file else null
	if method == "write_bytes":
		if not raw.begins_with("user://qua/") or not _safe_path(raw):
			return false
		DirAccess.make_dir_recursive_absolute(raw.get_base_dir())
		var temporary := raw + ".tmp"
		var file := FileAccess.open(temporary, FileAccess.WRITE)
		if not file:
			return false
		file.store_buffer(bytes)
		file.flush()
		var ok := file.get_error() == OK
		file.close()
		return ok and DirAccess.rename_absolute(temporary, raw) == OK
	var args = JSON.parse_string(raw)
	if not args is Dictionary:
		return JSON.stringify({"error": "Invalid host arguments"})
	if method == "resource_create":
		return JSON.stringify(_create_resource(args, bytes))
	return JSON.stringify(_call(method, args))

func _safe_path(path: String) -> bool:
	if not path.begins_with("res://") and not path.begins_with("user://qua/"):
		return false
	var relative := path.trim_prefix("res://").trim_prefix("user://qua/")
	return not relative.contains("\\") and not relative.contains(":") and not relative.split("/").has("..") and not relative.split("/").has(".")

func _call(method: String, args: Dictionary) -> Dictionary:
	var id: String = args.get("id", "")
	var node = nodes.get(id)
	match method:
		"frame_rate":
			Engine.max_fps = clampi(int(args.get("value", 0)), 0, 240)
		"clock": return {"value": Time.get_ticks_usec() / 1000.0}
		"log":
			var message: String = args.get("text", "")
			if args.get("level") == "error": push_error(message)
			elif args.get("level") == "warn": push_warning(message)
			else: print(message)
		"container_size": return {"value": {"width": get_viewport_rect().size.x, "height": get_viewport_rect().size.y}}
		"node_create":
			var item = ProjectionNode.new()
			item.host = self
			item.projection_id = id
			item.projection_kind = args.get("kind", "")
			item.name = args.get("name", id)
			nodes[id] = item
			nodes.get(args.get("parent", "root"), self).add_child(item)
			if item.projection_kind == "stage": stage = item
		"node_destroy":
			if is_instance_valid(node) and node != self: _remove_node(node)
		"node_clear":
			if is_instance_valid(node):
				for child in node.get_children():
					if child.get_script() == ProjectionNode: _remove_node(child)
		"node_parent":
			if is_instance_valid(node):
				if args.has("parent"): node.reparent(nodes[args.parent])
				elif node.get_parent(): node.get_parent().remove_child(node)
		"node_visible":
			if is_instance_valid(node): node.visible = args.get("visible", true)
		"node_transform":
			if is_instance_valid(node): node.apply_transform(args.get("transform", {}))
		"node_text":
			if is_instance_valid(node): node.apply_text(args.get("text", ""), args.get("style", {}), args.get("rich", false))
		"node_sprite":
			if is_instance_valid(node): node.apply_sprite(resources.get(args.get("resource", "")), args.get("options", {}))
		"node_metadata":
			if is_instance_valid(node): node.projection_metadata = args.get("metadata", {})
		"node_box":
			if is_instance_valid(node):
				node.box_style = args.get("style", {})
				node.queue_redraw()
		"node_control":
			if is_instance_valid(node): node.set_meta("control", args.get("control", {}))
		"hit_test":
			var point := Vector2(float(args.point.x), float(args.point.y))
			if is_instance_valid(stage): point = stage.get_global_transform() * point
			return {"value": _hit(node, point, args.get("options", {}))}
		"measure_text":
			var style: Dictionary = args.get("style", {})
			var font := resolve_font(style)
			var font_size := int(style.get("fontSize", 24))
			var measured := font.get_multiline_string_size(args.get("text", ""), HORIZONTAL_ALIGNMENT_LEFT, float(args.get("maxWidth", -1)), font_size)
			# Font sizes are fractional but measured extents are pixel-rounded.
			# Ceil would turn a single 43.75-unit line measured as 44 into two.
			var lines := maxf(1, roundf(measured.y / font.get_height(font_size)))
			return {"value": {"width": measured.x, "height": lines * float(style.get("lineHeight", font.get_height(font_size)))}}
		"resource_release":
			resources.erase(id)
			if media_files.has(id):
				DirAccess.remove_absolute(media_files[id])
				media_files.erase(id)
		"font_register":
			fonts[args.options.id] = {"font": resources.get(args.resource), "options": args.options}
			font_variations.clear()
			_refresh_fonts()
		"font_unregister":
			fonts.erase(id)
			font_variations.clear()
			_refresh_fonts()
		"file_exists": return {"value": _safe_path(args.path) and FileAccess.file_exists(args.path)}
		"capture_node": _capture_node(args)
		"file_mkdir", "file_delete", "file_move", "file_list": return _file_call(method, args)
		"audio_create", "audio_play", "audio_pause", "audio_stop", "audio_volume", "audio_loop", "audio_rate", "audio_seek", "audio_position", "audio_dispose", "audio_bus_volume": return _audio_call(method, args)
		"startup_error":
			push_error(args.get("message", "QuaEngine startup failed"))
			get_tree().quit(1)
		"quit": get_tree().quit()
		"destroy":
			for player in audio.values(): player.queue_free()
			audio.clear()
			for child in get_children(): child.queue_free()
			nodes.clear()
			resources.clear()
			fonts.clear()
			font_variations.clear()
		_:
			return {"error": "Unsupported Godot host operation: " + method}
	return {"value": null}

func _remove_node(node: Control) -> void:
	for child in node.get_children():
		if child.get_script() == ProjectionNode: _remove_node(child)
	nodes.erase(node.projection_id)
	node.hide()
	if node.get_parent(): node.get_parent().remove_child(node)
	node.queue_free()

func _hit(node: Node, point: Vector2, options: Dictionary) -> Variant:
	if not is_instance_valid(node) or (node is CanvasItem and not node.is_visible_in_tree()): return null
	if node is Control and node.clip_contents:
		if not Rect2(Vector2.ZERO, node.size).has_point(node.get_global_transform().affine_inverse() * point): return null
	var children := node.get_children()
	children.reverse()
	children.sort_custom(func(a, b): return a.z_index > b.z_index if a is CanvasItem and b is CanvasItem else false)
	for child in children:
		if child.get_script() == ProjectionNode:
			var found = _hit(child, point, options)
			if found != null: return found
	if node.get_script() != ProjectionNode: return null
	var metadata: Dictionary = node.projection_metadata
	if options.has("metadataKey") and not metadata.has(options.metadataKey): return null
	if options.has("metadataKeys") and not options.metadataKeys.any(func(key): return metadata.has(key)): return null
	if absf(node.get_global_transform().determinant()) < 0.00001: return null
	if Rect2(Vector2.ZERO, node.size).has_point(node.get_global_transform().affine_inverse() * point): return node.projection_id
	return null

func _create_resource(args: Dictionary, bytes: PackedByteArray) -> Dictionary:
	var kind: String = args.get("kind", "")
	if kind == "sha256":
		var hash := HashingContext.new()
		hash.start(HashingContext.HASH_SHA256)
		hash.update(bytes)
		return {"value": hash.finish().hex_encode()}
	var id: String = args.get("id", "")
	var resource: Resource
	var description := {"id": id, "kind": kind, "source": args.get("source"), "mimeType": args.get("mimeType")}
	match kind:
		"texture", "spriteFrame", "renderTexture":
			var image := Image.new()
			var result := ERR_FILE_UNRECOGNIZED
			if bytes.size() >= 8 and bytes[0] == 137 and bytes[1] == 80:
				result = image.load_png_from_buffer(bytes)
			elif bytes.size() >= 12 and bytes.slice(8, 12).get_string_from_ascii() == "WEBP":
				result = image.load_webp_from_buffer(bytes)
			elif bytes.size() >= 2 and bytes[0] == 255 and bytes[1] == 216:
				result = image.load_jpg_from_buffer(bytes)
			if result != OK: return {"error": "Unsupported Godot image: " + str(args.get("source", id))}
			resource = ImageTexture.create_from_image(image)
			description.width = image.get_width()
			description.height = image.get_height()
			if kind == "renderTexture": description.metadata = {"renderTexture": true}
		"font":
			var font := FontFile.new()
			font.data = bytes
			# Hinted raster glyphs preserve small CJK strokes. MSDF loses detail in
			# compact UI; oversampling keeps raster text clean under stage scaling.
			font.multichannel_signed_distance_field = false
			font.oversampling = 2.0
			font.hinting = TextServer.HINTING_LIGHT
			font.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_AUTO
			resource = font
		"video":
			if bytes.slice(0, 4).get_string_from_ascii() != "OggS": return {"error": "Godot video requires Theora in Ogg; configure video.format: ogv for this asset target."}
			DirAccess.make_dir_recursive_absolute("user://qua-media")
			var path := "user://qua-media/" + id.sha256_text() + ".ogv"
			var file := FileAccess.open(path, FileAccess.WRITE)
			if not file: return {"error": "Cannot prepare Godot video decoder file"}
			file.store_buffer(bytes)
			file.close()
			var video := VideoStreamTheora.new()
			video.file = path
			resource = video
			media_files[id] = path
		"audio":
			if bytes.slice(0, 4).get_string_from_ascii() == "OggS":
				resource = AudioStreamOggVorbis.load_from_buffer(bytes)
			elif bytes.slice(0, 4).get_string_from_ascii() == "RIFF":
				resource = AudioStreamWAV.load_from_buffer(bytes)
			else:
				var stream := AudioStreamMP3.new()
				stream.data = bytes
				resource = stream
			if resource: description.duration = resource.get_length() * 1000.0
		_: return {"error": "Unsupported Godot resource kind: " + kind}
	if not resource: return {"error": "Godot could not decode resource: " + id}
	resources[id] = resource
	return {"value": description}

func _file_call(method: String, args: Dictionary) -> Dictionary:
	var path: String = args.get("path", args.get("from", ""))
	if not path.begins_with("user://qua/") or not _safe_path(path): return {"error": "Invalid storage path"}
	match method:
		"file_mkdir":
			if DirAccess.make_dir_recursive_absolute(path) != OK: return {"error": "Cannot create storage directory"}
		"file_delete":
			if FileAccess.file_exists(path) and DirAccess.remove_absolute(path) != OK: return {"error": "Cannot delete storage file"}
		"file_move":
			if not args.to.begins_with("user://qua/") or not _safe_path(args.to): return {"error": "Invalid storage destination"}
			DirAccess.make_dir_recursive_absolute(str(args.to).get_base_dir())
			if DirAccess.rename_absolute(path, args.to) != OK: return {"error": "Cannot move storage file"}
		"file_list": return {"value": _list_files(path)}
	return {"value": null}

func _list_files(path: String) -> Array:
	var result: Array = []
	var directory := DirAccess.open(path)
	if not directory: return result
	for file in directory.get_files():
		if file.ends_with(".tmp"): continue
		var full := path.path_join(file)
		var handle := FileAccess.open(full, FileAccess.READ)
		result.append({"path": full.trim_prefix("user://qua/"), "size": handle.get_length(), "mtime": FileAccess.get_modified_time(full) * 1000})
	for child in directory.get_directories(): result.append_array(_list_files(path.path_join(child)))
	return result

func _audio_call(method: String, args: Dictionary) -> Dictionary:
	var id: String = args.get("id", "")
	var player: AudioStreamPlayer = audio.get(id)
	if method == "audio_create":
		if not resources.get(args.resource) is AudioStream: return {"error": "Missing Godot audio stream"}
		player = AudioStreamPlayer.new()
		player.stream = resources[args.resource].duplicate(true)
		var options: Dictionary = args.get("options", {})
		player.volume_linear = float(options.get("volume", 1))
		player.pitch_scale = maxf(0.01, float(options.get("playbackRate", 1)))
		player.bus = _audio_bus(options.get("bus", "Master"))
		_audio_loop(player, options.get("loop", false))
		player.finished.connect(func():
			if player.get_meta("loop", false): player.play()
			else: events.append({"type": "audio-ended", "id": id}))
		audio[id] = player
		add_child(player)
	elif method == "audio_bus_volume":
		var bus := AudioServer.get_bus_index(_audio_bus(args.bus))
		AudioServer.set_bus_volume_db(bus, linear_to_db(float(args.volume)))
	elif player:
		match method:
			"audio_play":
				if player.stream_paused: player.stream_paused = false
				elif not player.playing: player.play()
			"audio_pause": player.stream_paused = true
			"audio_stop": player.stop()
			"audio_volume": player.volume_linear = maxf(0, float(args.value))
			"audio_loop": _audio_loop(player, args.value)
			"audio_rate": player.pitch_scale = maxf(0.01, float(args.value))
			"audio_seek": player.seek(float(args.value) / 1000.0)
			"audio_position": return {"value": player.get_playback_position() * 1000.0}
			"audio_dispose":
				player.stop()
				player.queue_free()
				audio.erase(id)
	return {"value": null}

func _audio_bus(bus: String) -> String:
	if bus.to_lower() == "master": return "Master"
	if AudioServer.get_bus_index(bus) < 0:
		AudioServer.add_bus()
		AudioServer.set_bus_name(AudioServer.bus_count - 1, bus)
	return bus

func _audio_loop(player: AudioStreamPlayer, enabled: bool) -> void:
	# Native decoder looping avoids a frame-sized gap from finished/play callbacks.
	if player.stream is AudioStreamWAV:
		if enabled and player.stream.loop_end <= player.stream.loop_begin:
			player.stream.loop_begin = 0
			player.stream.loop_end = roundi(player.stream.get_length() * player.stream.mix_rate)
		player.stream.loop_mode = AudioStreamWAV.LOOP_FORWARD if enabled else AudioStreamWAV.LOOP_DISABLED
		player.set_meta("loop", false)
	elif player.stream is AudioStreamMP3 or player.stream is AudioStreamOggVorbis:
		player.stream.loop = enabled
		player.set_meta("loop", false)
	else:
		player.set_meta("loop", enabled)

func _capture_node(args: Dictionary) -> void:
	await RenderingServer.frame_post_draw
	var node: Control = nodes.get(args.get("node", ""))
	var result := {"type": "capture-ready", "id": args.id}
	if not is_instance_valid(node):
		result.error = "Capture node no longer exists"
	else:
		var image := get_viewport().get_texture().get_image()
		var bounds := Rect2i(node.get_global_rect())
		var viewport: Dictionary = args.get("viewport", {})
		if not viewport.is_empty(): bounds = Rect2i(int(viewport.x), int(viewport.y), int(viewport.width), int(viewport.height))
		var rect := bounds.intersection(Rect2i(Vector2i.ZERO, image.get_size()))
		if rect.size.x <= 0 or rect.size.y <= 0:
			result.error = "Capture node is outside the viewport"
		else:
			image = image.get_region(rect)
			var options: Dictionary = args.get("options", {})
			var ratio := minf(1, minf(float(options.get("maxWidth", image.get_width())) / image.get_width(), float(options.get("maxHeight", image.get_height())) / image.get_height()))
			image.resize(maxi(1, int(image.get_width() * ratio)), maxi(1, int(image.get_height() * ratio)), Image.INTERPOLATE_LANCZOS)
			var mime: String = options.get("mimeType", "image/png")
			var bytes: PackedByteArray
			if mime == "image/jpeg": bytes = image.save_jpg_to_buffer(float(options.get("quality", 0.9)))
			elif mime == "image/webp": bytes = image.save_webp_to_buffer(false, float(options.get("quality", 0.9)))
			else:
				mime = "image/png"
				bytes = image.save_png_to_buffer()
			var path := "user://qua/.captures/" + str(args.id) + ".bin"
			if bridge("write_bytes", path, bytes):
				result.merge({"path": path, "mimeType": mime, "width": image.get_width(), "height": image.get_height()})
			else: result.error = "Cannot write captured image"
	events.append(result)

func _refresh_fonts() -> void:
	for node in nodes.values():
		if node != self and is_instance_valid(node) and is_instance_valid(node.text_node):
			node.apply_text(node.text_value, node.text_style, node.text_rich)

func resolve_font(style: Dictionary) -> Font:
	var family: String = style.get("fontFamily", "")
	var weight: String = str(style.get("fontWeight", "400"))
	var key := family + "/" + weight + "/" + str(style.get("letterSpacing", 0)) + "/" + str(style.get("fontSize", 24)) + "/" + str(style.get("lineHeight", 0))
	if font_variations.has(key): return font_variations[key]
	var selected: Font = ThemeDB.fallback_font
	for candidate in family.split(","):
		var found := false
		for entry in fonts.values():
			if entry.options.get("family") == candidate.strip_edges().trim_prefix('"').trim_suffix('"'):
				selected = entry.font
				found = true
				if str(entry.options.get("weight", "400")) == weight: break
		if found: break
	var variation := FontVariation.new()
	variation.base_font = selected
	variation.spacing_glyph = int(style.get("letterSpacing", 0))
	if style.has("lineHeight"):
		# CSS line-height distributes leading around the font metrics. Label otherwise
		# suppresses a complete line when its native ascent/descent exceeds the box.
		var leading := floori(float(style.lineHeight) - selected.get_height(int(style.get("fontSize", 24))))
		variation.spacing_top = floori(leading / 2.0)
		variation.spacing_bottom = leading - variation.spacing_top
	font_variations[key] = variation
	return variation

func parse_color(value: Variant) -> Color:
	if value == null: return Color.TRANSPARENT
	var text := str(value).strip_edges()
	if text.begins_with("rgb"):
		var expression := RegEx.new()
		expression.compile("[0-9.]+")
		var parts := expression.search_all(text)
		if parts.size() >= 3: return Color(float(parts[0].get_string()) / 255, float(parts[1].get_string()) / 255, float(parts[2].get_string()) / 255, float(parts[3].get_string()) if parts.size() > 3 else 1)
	return Color.from_string(text, Color.TRANSPARENT)

func warn_once(key: String, message: String) -> void:
	if warnings.has(key): return
	warnings[key] = message
	push_warning(message)

# Explicit debug-only file transport for deterministic real-Godot input/capture tests.
# It offers no arbitrary JS/GDScript evaluation and is absent unless requested at launch.
func _review_request() -> void:
	var directory := DirAccess.open(review_dir.path_join("requests"))
	if not directory: return
	var files := directory.get_files()
	files.sort()
	for file in files:
		if not file.ends_with(".json"): continue
		review_busy = true
		var path := review_dir.path_join("requests").path_join(file)
		var request = JSON.parse_string(FileAccess.get_file_as_string(path))
		DirAccess.remove_absolute(path)
		var result: Dictionary = {}
		if not request is Dictionary:
			result = {"error": "Invalid review request"}
		else:
			match request.get("action"):
				"snapshot":
					var projected: Array = []
					for node in nodes.values():
						if node == self or not is_instance_valid(node): continue
						var rect: Rect2 = node.get_global_rect()
						projected.append({"id": node.projection_id, "name": node.name, "kind": node.projection_kind, "visible": node.is_visible_in_tree(), "bounds": {"x": rect.position.x, "y": rect.position.y, "width": rect.size.x, "height": rect.size.y}, "metadata": node.projection_metadata, "textDetails": {"rect": str(node.text_node.get_rect()), "fontHeight": node.text_node.get_theme_font("font").get_height(node.text_node.get_theme_font_size("font_size")), "lineCount": node.text_node.get_line_count(), "visibleLines": node.text_node.get_visible_line_count(), "style": node.text_style} if is_instance_valid(node.text_node) else {}, "text": node.text_node.text if is_instance_valid(node.text_node) else ""})
					result = {"engine": JSON.parse_string(vm.inspect()), "nodes": projected, "warnings": warnings.values(), "frame": frame_number, "audio": audio.keys(), "performance": {"targetFrameRate": Engine.max_fps, "vsyncMode": DisplayServer.window_get_vsync_mode(), "screenRefreshHz": DisplayServer.screen_get_refresh_rate(), "fps": Engine.get_frames_per_second(), "frameTimesMs": frame_times.duplicate(), "scriptTimesMs": script_times.duplicate(), "drawCalls": Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME), "nodes": nodes.size()}, "size": {"width": get_viewport_rect().size.x, "height": get_viewport_rect().size.y}}
				"pointer":
					var event := InputEventMouseButton.new()
					event.position = Vector2(float(request.get("x", 0)), float(request.get("y", 0)))
					event.global_position = event.position
					event.button_index = MOUSE_BUTTON_LEFT
					event.pressed = request.get("pressed", true)
					Input.parse_input_event(event)
				"wheel":
					events.append({"kind": "pointer", "phase": "wheel", "x": request.get("x", 0), "y": request.get("y", 0), "metadata": {"deltaY": request.get("deltaY", 0)}})
				"key":
					var event := InputEventKey.new()
					event.keycode = OS.find_keycode_from_string(request.get("key", "Space"))
					event.physical_keycode = event.keycode
					event.pressed = request.get("pressed", true)
					Input.parse_input_event(event)
				"resize": get_window().size = Vector2i(int(request.get("width", 1280)), int(request.get("height", 720)))
				"capture":
					await RenderingServer.frame_post_draw
					var image := get_viewport().get_texture().get_image()
					var name: String = request.get("name", "capture.png")
					if name.get_file() != name or not name.ends_with(".png"):
						result = {"error": "Capture name must be a PNG filename"}
					else:
						var output := review_dir.path_join(name)
						var status := image.save_png(output)
						result = {"path": output, "width": image.get_width(), "height": image.get_height(), "status": status}
				"quit": get_tree().quit()
				_: result = {"error": "Unknown review action"}
		var response := FileAccess.open(review_dir.path_join("responses").path_join(file), FileAccess.WRITE)
		if response:
			response.store_string(JSON.stringify(result))
			response.close()
		review_busy = false
		return
