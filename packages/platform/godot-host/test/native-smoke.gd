extends "res://addons/quaengine/host.gd"

# Runs in a real Godot window; all inputs are disposable files extracted from a
# generated QPK by demo/scripts/godot-native-smoke.mjs, never loose game updates.
func _ready() -> void:
	nodes["root"] = self
	var report: Dictionary = {}
	var font_result := _create_resource({"id": "font", "kind": "font"}, FileAccess.get_file_as_bytes("res://.native-smoke/font.otf"))
	if font_result.has("error"): return _fail(font_result.error)
	_call("font_register", {"resource": "font", "options": {"id": "font", "family": "Fixture"}})
	report.fontRasterization = {"msdf": resources.font.multichannel_signed_distance_field, "oversampling": resources.font.oversampling, "hinting": resources.font.hinting}
	if report.fontRasterization.msdf or report.fontRasterization.oversampling < 2: return _fail("Small UI font rasterization configuration regressed")
	_call("node_create", {"id": "text", "kind": "text"})
	_call("node_transform", {"id": "text", "transform": {"x": 30, "y": 30, "width": 400, "height": 28}})
	_call("node_text", {"id": "text", "text": "中文行高验证", "style": {"fontFamily": "Fixture", "fontSize": 20, "lineHeight": 28}})
	await get_tree().process_frame
	report.visibleTextLines = nodes.text.text_node.get_visible_line_count()
	report.measured = _call("measure_text", {"text": "单行", "style": {"fontFamily": "Fixture", "fontSize": 30, "lineHeight": 54}, "maxWidth": 400}).value
	if report.visibleTextLines != 1 or report.measured.height != 54: return _fail("Font line metrics do not match the logical line box")
	var video_result := _create_resource({"id": "video", "kind": "video"}, FileAccess.get_file_as_bytes("res://.native-smoke/video.ogv"))
	if video_result.has("error"): return _fail(video_result.error)
	_call("node_create", {"id": "video", "kind": "video"})
	_call("node_transform", {"id": "video", "transform": {"x": 30, "y": 90, "width": 640, "height": 360}})
	_call("node_sprite", {"id": "video", "resource": "video", "options": {"video": {"muted": true, "loop": true, "playbackRate": 1}}})
	var audio_result := _create_resource({"id": "tone", "kind": "audio"}, FileAccess.get_file_as_bytes("res://.native-smoke/tone.wav"))
	if audio_result.has("error"): return _fail(audio_result.error)
	var capture := AudioEffectCapture.new()
	capture.buffer_length = 2
	AudioServer.add_bus_effect(0, capture)
	_call("audio_create", {"id": "tone", "resource": "tone", "options": {"bus": "bgm", "volume": 0.2, "loop": true}})
	_call("audio_play", {"id": "tone"})
	await get_tree().create_timer(0.6).timeout
	var pcm := capture.get_buffer(capture.get_frames_available())
	var peak := 0.0
	for sample in pcm: peak = maxf(peak, maxf(absf(sample.x), absf(sample.y)))
	report.audioFrames = pcm.size()
	report.audioPeak = peak
	report.audioPosition = _call("audio_position", {"id": "tone"}).value
	report.videoPosition = nodes.video.video_node.stream_position
	if peak <= 0.001 or report.audioPosition <= 100 or report.videoPosition <= 0.1: return _fail("Native media did not produce audio/video progress: " + JSON.stringify(report))
	_call("audio_pause", {"id": "tone"})
	var paused: float = audio.tone.get_playback_position()
	await get_tree().create_timer(0.1).timeout
	report.pauseDelta = absf(audio.tone.get_playback_position() - paused)
	if report.pauseDelta > 0.02: return _fail("Audio pause did not hold position")
	_call("audio_play", {"id": "tone"})
	_call("audio_seek", {"id": "tone", "value": 1200})
	await get_tree().create_timer(0.05).timeout
	report.audioSeekPosition = _call("audio_position", {"id": "tone"}).value
	if report.audioSeekPosition < 1100: return _fail("Audio seek did not reach requested time")
	_call("audio_bus_volume", {"bus": "master", "volume": 0.5})
	report.masterVolume = db_to_linear(AudioServer.get_bus_volume_db(0))
	if absf(report.masterVolume - 0.5) > 0.001: return _fail("Master volume is not routed to the real master bus")
	_call("capture_node", {"id": "test", "node": "root", "options": {"maxWidth": 640, "maxHeight": 360, "mimeType": "image/png"}})
	await get_tree().create_timer(0.1).timeout
	var captured: Dictionary = {}
	for event in events:
		if event.get("type") == "capture-ready": captured = event
	if captured.is_empty() or captured.has("error"): return _fail("Native capture did not complete: " + str(captured))
	var image := Image.new()
	if image.load_png_from_buffer(FileAccess.get_file_as_bytes(captured.path)) != OK: return _fail("Capture is not valid PNG")
	if image.is_invisible(): return _fail("Capture is empty")
	image.save_png("res://.native-smoke/capture.png")
	_call("file_delete", {"path": captured.path})
	report.capture = {"width": image.get_width(), "height": image.get_height()}
	_call("audio_dispose", {"id": "tone"})
	_call("node_destroy", {"id": "video"})
	_call("resource_release", {"id": "video"})
	report.mediaFilesAfterRelease = media_files.size()
	if report.mediaFilesAfterRelease != 0: return _fail("Video decoder file leaked")
	# A long promise chain must yield to native input/drawing between jobs.
	if not ClassDB.class_exists("QuaJsRuntime"):
		GDExtensionManager.load_extension("res://addons/quaengine/quaengine.gdextension")
	var scheduler = ClassDB.instantiate("QuaJsRuntime")
	if scheduler == null: return _fail("Scheduler GDExtension could not load")
	if not scheduler.start("let completed = 0; function job() { const until = Date.now() + 1; while (Date.now() < until) {} if (++completed < 40) Promise.resolve().then(job); } Promise.resolve().then(job); globalThis.__quaTick = () => {}; globalThis.__quaInspect = () => ({completed});", Callable(self, "bridge")):
		return _fail("Scheduler fixture failed to initialize")
	scheduler.tick(0, "[]")
	report.jobsAfterFirstTick = JSON.parse_string(scheduler.inspect()).completed
	if report.jobsAfterFirstTick <= 0 or report.jobsAfterFirstTick >= 40: return _fail("Promise chain did not yield between frames")
	for frame in range(40):
		await get_tree().process_frame
		scheduler.tick(Time.get_ticks_usec() / 1000.0, "[]")
	report.completedJobs = JSON.parse_string(scheduler.inspect()).completed
	if report.completedJobs != 40: return _fail("Deferred promise jobs did not resume")
	scheduler.stop()
	report.frameRates = []
	# Measure real rendered frames with vsync disabled in this disposable fixture;
	# production remains subject to its display's refresh/vsync ceiling.
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	for target in [30, 60, 120]:
		_call("frame_rate", {"value": target})
		await get_tree().create_timer(0.2).timeout
		var intervals: Array[float] = []
		var previous := Time.get_ticks_usec()
		for frame in range(36):
			await RenderingServer.frame_post_draw
			var now := Time.get_ticks_usec()
			if frame > 0: intervals.append(float(now - previous) / 1000.0)
			previous = now
		intervals.sort()
		var median: float = intervals[intervals.size() / 2]
		var total := 0.0
		for interval in intervals: total += interval
		var measured_fps: float = intervals.size() * 1000.0 / total
		report.frameRates.append({"target": target, "medianMs": median, "p95Ms": intervals[int(intervals.size() * 0.95)], "measuredFps": measured_fps})
		if measured_fps > target * 1.2 or measured_fps < target * 0.65: return _fail("Frame limit is not applied: " + JSON.stringify(report.frameRates))
	var output := FileAccess.open("res://.native-smoke/report.json", FileAccess.WRITE)
	output.store_string(JSON.stringify(report, "  "))
	output.close()
	print("QUA_GODOT_NATIVE_SMOKE_OK " + JSON.stringify(report))
	AudioServer.remove_bus_effect(0, 0)
	_call("destroy", {})
	await get_tree().process_frame
	get_tree().quit()

func _fail(message: String) -> void:
	push_error(message)
	get_tree().quit(1)
