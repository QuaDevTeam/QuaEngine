extends Control

const Host = preload("res://addons/quaengine/host.gd")
var ready_count := 0
var closed_count := 0
var initial_master := 0.0
var initial_fps := 0
var owned_paths: Array[String] = []

func _ready() -> void:
	initial_master = AudioServer.get_bus_volume_db(0)
	initial_fps = Engine.max_fps
	AudioServer.set_bus_volume_db(0, -6.0)
	Engine.max_fps = 77
	var first = _host("first", Vector2(50, 80))
	var sentinel := Label.new()
	sentinel.text = "Parent-owned child survives module close"
	first.add_child(sentinel)
	var second = _host("second", Vector2(680, 80))
	first.start_module()
	second.start_module()
	for frame in range(1200):
		await get_tree().process_frame
		if ready_count == 2: break
	if ready_count != 2: return _fail("Both isolated module VMs did not become ready")
	await get_tree().create_timer(0.5).timeout
	var bounds: Dictionary = first._call("container_size", {}).value
	if bounds.width != 540 or bounds.height != 400: return _fail("Module measured the viewport instead of its parent region")
	first._call("frame_rate", {"value": 30})
	first._call("audio_bus_volume", {"bus": "master", "volume": 0.2})
	if Engine.max_fps != 77 or absf(AudioServer.get_bus_volume_db(0) + 6.0) > 0.001: return _fail("Module changed parent frame-rate/audio authority")
	var stored := PackedByteArray([1, 2, 255])
	if not first.bridge("write_bytes", "user://qua/fixture/value.bin", stored): return _fail("Module storage write failed")
	if first.bridge("read_bytes", "user://qua/fixture/value.bin") != stored: return _fail("Module storage roundtrip failed")
	if second.bridge("read_bytes", "user://qua/fixture/value.bin") != null: return _fail("Independent module namespaces share saves")
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://.embedding-smoke/capture.png")
	var second_frames: int = second.frame_number
	first._call("quit", {})
	for frame in range(120):
		await get_tree().process_frame
		if closed_count == 1: break
	# process_frame resumes before nodes receive _process; observe a completed
	# sibling frame rather than asserting against that signal's scheduling phase.
	await get_tree().process_frame
	await get_tree().process_frame
	if closed_count != 1 or not second.running or second.frame_number <= second_frames: return _fail("Closing a module stopped the parent or sibling: " + JSON.stringify({"closed": closed_count, "running": second.running, "before": second_frames, "after": second.frame_number}))
	if not is_instance_valid(sentinel) or sentinel.get_parent() != first: return _fail("Module destroyed an author-owned child")
	if not first.resources.is_empty() or not first.audio.is_empty() or not first.owned_audio_buses.is_empty(): return _fail("Module native handles leaked")
	first.start_module()
	for frame in range(1200):
		await get_tree().process_frame
		if ready_count == 3: break
	if ready_count != 3: return _fail("Closed module could not restart")
	first.stop_module()
	second.stop_module()
	for frame in range(120):
		await get_tree().process_frame
		if closed_count == 3: break
	if closed_count != 3: return _fail("Final module shutdown did not complete")
	var report := {"godot": Engine.get_version_info().string, "independentVms": 2, "readyCount": ready_count, "closeCount": closed_count, "container": bounds, "siblingContinued": true, "parentAudioUnchanged": true, "parentFrameRateUnchanged": true, "storageIsolated": true, "authorChildPreserved": true, "restart": true}
	var file := FileAccess.open("res://.embedding-smoke/report.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "  "))
	file.close()
	_restore()
	print("QUA_GODOT_EMBEDDING_OK " + JSON.stringify(report))
	get_tree().quit()

func _host(label: String, origin: Vector2):
	var host = Host.new()
	host.auto_start = false
	host.standalone = false
	host.position = origin
	host.size = Vector2(540, 400)
	host.storage_namespace = "qa-embedding-" + str(OS.get_process_id()) + "/" + label
	owned_paths.append("user://qua/qa-embedding-" + str(OS.get_process_id()))
	host.module_ready.connect(func(): ready_count += 1)
	host.module_closed.connect(func(): closed_count += 1)
	host.module_failed.connect(_fail)
	add_child(host)
	return host

func _restore() -> void:
	AudioServer.set_bus_volume_db(0, initial_master)
	Engine.max_fps = initial_fps
	for path in owned_paths: _erase(path)

func _erase(path: String) -> void:
	var dir := DirAccess.open(path)
	if not dir: return
	for file in dir.get_files(): DirAccess.remove_absolute(path.path_join(file))
	for child in dir.get_directories(): _erase(path.path_join(child))
	DirAccess.remove_absolute(path)

func _fail(message: String) -> void:
	push_error(message)
	_restore()
	get_tree().quit(1)
