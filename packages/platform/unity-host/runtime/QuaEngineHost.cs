using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.Video;

namespace QuaEngine.Unity
{
    /// <summary>A scoped narrative module. Closing it never exits or changes the host application.</summary>
    [RequireComponent(typeof(RectTransform))]
    public sealed class QuaEngineHost : MonoBehaviour
    {
        [Tooltip("Resources prefix emitted by Quack, for example QuaContent/dev.example.game.")]
        public string contentPrefix;
        [Tooltip("Separate account/profile storage namespace. Set before StartModule.")]
        public string storageNamespace = "default";
        public bool autoStart = true;
        public bool captureInput = true;
        public bool controlApplicationFrameRate = false;
        public event Action Closed;
        public event Action Ready;
        public event Action<Exception> Failed;
        public event Action<string> StoryMessage;
        public event Action<string> StoryResult;
        public bool IsRunning => vm != null && !stopRequested;

        internal sealed class Resource
        {
            internal string id, kind;
            internal Texture2D texture;
            internal AudioClip audio;
            internal VideoClip video;
            internal Font font;
        }
        sealed class AudioHandle { internal AudioSource source; internal string bus; internal float volume; internal bool playing, paused; internal double endsAt; }
        readonly Dictionary<string, ProjectionNode> nodes = new Dictionary<string, ProjectionNode>();
        readonly Dictionary<string, Resource> resources = new Dictionary<string, Resource>();
        readonly Dictionary<string, AudioHandle> audio = new Dictionary<string, AudioHandle>();
        readonly Dictionary<string, float> buses = new Dictionary<string, float>();
        readonly Dictionary<string, (string family, Font font)> fonts = new Dictionary<string, (string, Font)>();
        readonly HashSet<string> warnings = new HashSet<string>();
        readonly HashSet<string> keys = new HashSet<string>();
        readonly List<JObject> pendingInput = new List<JObject>();
        readonly List<JObject> pendingStoryMessages = new List<JObject>();
        JObject embeddedRequest;
        bool emittedStoryResult;
        NativeVm vm;
        ProjectionNode root, stage;
        Canvas canvas;
        string storageRoot;
        bool focused, stopRequested, stopping;
        bool readyPending;
        Exception failurePending;
        Vector2 previousSize;
        int previousFrameRate;
        bool changedFrameRate;
        internal float MasterVolume => buses.TryGetValue("master", out var value) ? value : 1;

        // Consumer callbacks cannot interrupt cleanup or suppress later listeners.
        void Notify(Action listeners)
        {
            if (listeners == null) return;
            foreach (Action listener in listeners.GetInvocationList())
                try { listener(); } catch (Exception error) { Debug.LogException(error, this); }
        }
        void Notify<T>(Action<T> listeners, T value)
        {
            if (listeners == null) return;
            foreach (Action<T> listener in listeners.GetInvocationList())
                try { listener(value); } catch (Exception error) { Debug.LogException(error, this); }
        }

        void Start() { if (autoStart) StartModule(); }

        public void OpenStory(string sessionId, string parametersJson = "{}")
        {
            if (vm != null || stopping) throw new InvalidOperationException("Close the previous story first.");
            if (Encoding.UTF8.GetByteCount(parametersJson) > 65536) throw new InvalidDataException("Embedded parameters exceed 64 KiB.");
            JObject parameters;
            using (var reader = new JsonTextReader(new StringReader(parametersJson)) { DateParseHandling = DateParseHandling.None, MaxDepth = 24 })
            {
                parameters = JObject.Load(reader);
                if (reader.Read()) throw new InvalidDataException("Unexpected content after embedded parameters.");
            }
            foreach (var token in parameters.DescendantsAndSelf())
            {
                if (token.Type == JTokenType.Constructor || token.Type == JTokenType.Undefined || token.Type == JTokenType.Raw)
                    throw new InvalidDataException("Embedded parameters must contain JSON values only.");
                if (token.Type == JTokenType.Float)
                {
                    double number = token.Value<double>();
                    if (double.IsNaN(number) || double.IsInfinity(number)) throw new InvalidDataException("Embedded numbers must be finite.");
                }
            }
            embeddedRequest = new JObject { ["protocol"] = "qua-embedded", ["version"] = 1, ["type"] = "open", ["sessionId"] = sessionId, ["storageNamespace"] = storageNamespace, ["parameters"] = parameters };
            emittedStoryResult = false;
            StartModule();
        }

        public void CancelStory()
        {
            if (embeddedRequest == null || vm == null) return;
            pendingInput.Add(new JObject { ["type"] = "embedded-command", ["command"] = new JObject { ["protocol"] = "qua-embedded", ["version"] = 1, ["type"] = "cancel", ["sessionId"] = embeddedRequest["sessionId"] } });
        }

        void FlushStoryMessages(bool includeClosed = false)
        {
            var pending = pendingStoryMessages.ToArray(); pendingStoryMessages.Clear();
            foreach (var message in pending)
            {
                if (message.Value<string>("sessionId") != embeddedRequest?.Value<string>("sessionId")) continue;
                if (message.Value<string>("type") == "closed" && !includeClosed) { pendingStoryMessages.Add(message); continue; }
                if (message.Value<string>("type") == "result")
                {
                    if (emittedStoryResult) continue;
                    emittedStoryResult = true;
                    Notify(StoryResult, message["outcome"].ToString(Formatting.None));
                }
                Notify(StoryMessage, message.ToString(Formatting.None));
            }
        }

        public void StartModule()
        {
            if (vm != null || stopping) throw new InvalidOperationException("Stop the previous QuaEngine module before starting another.");
            try
            {
                if (!Application.unityVersion.StartsWith("6000.3.", StringComparison.Ordinal))
                    throw new NotSupportedException("QuaEngine Unity adapter declares the Unity 6.3 LTS (6000.3) series only.");
                if (Application.platform != RuntimePlatform.OSXEditor && Application.platform != RuntimePlatform.OSXPlayer
                    && Application.platform != RuntimePlatform.WindowsEditor && Application.platform != RuntimePlatform.WindowsPlayer
                    && Application.platform != RuntimePlatform.LinuxEditor && Application.platform != RuntimePlatform.LinuxPlayer)
                    throw new NotSupportedException("QuaEngine QuickJS plugins currently target desktop Unity only.");
                canvas = GetComponentInParent<Canvas>();
                if (!canvas) throw new InvalidOperationException("Mount QuaEngineHost under a host-owned Canvas.");
                ValidateRelative(contentPrefix); ValidateRelative(storageNamespace);
                var config = JObject.Parse(LoadText("session.json"));
                if (config.Value<int>("schemaVersion") != 1 || config.Value<string>("target") != "unity") throw new InvalidDataException("Invalid Unity session manifest.");
                var target = JObject.Parse(LoadText("target-bundle-manifest.json"));
                if (target.Value<string>("target") != "unity" || target.Value<string>("targetCoreResolver") != "unity-core-resolver") throw new InvalidDataException("Unity active-target manifest mismatch.");
                string bundleId = config.Value<string>("bundleId"); ValidateRelative(bundleId);
                storageRoot = Path.GetFullPath(Path.Combine(Application.persistentDataPath, "QuaEngine", bundleId, storageNamespace));
                Directory.CreateDirectory(storageRoot);
                var owned = new GameObject("QuaEngine projection", typeof(RectTransform));
                owned.layer = gameObject.layer;
                var rect = (RectTransform)owned.transform; rect.SetParent(transform, false);
                rect.anchorMin = Vector2.zero; rect.anchorMax = Vector2.one; rect.offsetMin = rect.offsetMax = Vector2.zero;
                root = owned.AddComponent<ProjectionNode>(); root.Initialize(this, "root", "root");
                // The root stretches to the mount region; child coordinates remain logical.
                rect.anchorMin = Vector2.zero; rect.anchorMax = Vector2.one; rect.offsetMin = rect.offsetMax = Vector2.zero;
                nodes.Add("root", root); previousSize = rect.rect.size;
                stopRequested = false; focused = false; warnings.Clear();
                var source = LoadBytes("qua/runtime.js");
                if (Hash(source) != config.Value<string>("runtimeHash")) throw new InvalidDataException("Unity runtime bundle hash mismatch.");
                vm = new NativeVm(Encoding.UTF8.GetString(source), Bridge);
            }
            catch (Exception error) { Release(); Notify(Failed, error); throw; }
        }

        public void StopModule()
        {
            if (vm?.IsDispatching == true) { stopRequested = true; return; }
            if (stopping || (vm == null && root == null)) return;
            stopping = true;
            try { vm?.Shutdown(Time.realtimeSinceStartupAsDouble * 1000); }
            catch (Exception error) { Debug.LogException(error, this); QueueForcedClose(error); Notify(Failed, error); }
            finally { Release(); FlushStoryMessages(true); stopping = false; Notify(Closed); }
        }

        void QueueForcedClose(Exception error)
        {
            if (embeddedRequest == null) return;
            string text = error.Message.Length > 4096 ? error.Message.Substring(0, 4096) : error.Message;
            JObject Envelope(string type) => new JObject { ["protocol"] = "qua-embedded", ["version"] = 1, ["sessionId"] = embeddedRequest["sessionId"], ["type"] = type };
            if (!emittedStoryResult && !pendingStoryMessages.Any(item => item.Value<string>("type") == "result"))
            {
                var message = Envelope("result"); message["outcome"] = new JObject { ["status"] = "error", ["code"] = "SHUTDOWN_TIMEOUT", ["message"] = text }; pendingStoryMessages.Add(message);
            }
            var failure = Envelope("error"); failure["error"] = new JObject { ["code"] = "SHUTDOWN_TIMEOUT", ["message"] = text }; pendingStoryMessages.Add(failure);
            if (!pendingStoryMessages.Any(item => item.Value<string>("type") == "closed")) pendingStoryMessages.Add(Envelope("closed"));
        }

        void OnDisable() { StopModule(); }
        void OnDestroy() { StopModule(); }
        void Update()
        {
            if (vm == null) return;
            var activeVm = vm;
            if (root && previousSize != root.Rect.rect.size) { previousSize = root.Rect.rect.size; pendingInput.Add(new JObject { ["type"] = "layout" }); }
            foreach (var pair in audio.ToArray())
            {
                var handle = pair.Value;
                if (handle.playing && !handle.source.loop && !handle.source.isPlaying && AudioSettings.dspTime >= handle.endsAt)
                { handle.playing = false; pendingInput.Add(new JObject { ["type"] = "audio-ended", ["id"] = pair.Key }); }
            }
            var events = new JArray(pendingInput); pendingInput.Clear();
            try { activeVm.Tick(Time.realtimeSinceStartupAsDouble * 1000, events.ToString(Formatting.None)); }
            catch (Exception error) { Debug.LogException(error, this); stopRequested = true; Notify(Failed, error); }
            if (vm != activeVm) return;
            FlushStoryMessages();
            if (vm != activeVm) return;
            if (readyPending) { readyPending = false; Notify(Ready); }
            if (vm != activeVm) return;
            if (failurePending != null) { var error = failurePending; failurePending = null; Notify(Failed, error); }
            if (vm != activeVm) return;
            if (stopRequested) StopModule();
        }

        void OnGUI()
        {
            if (vm == null || !captureInput || !root) return;
            var current = Event.current;
            var camera = canvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : canvas.worldCamera;
            var screen = new Vector2(current.mousePosition.x, Screen.height - current.mousePosition.y);
            RectTransformUtility.ScreenPointToLocalPointInRectangle(root.Rect, screen, camera, out var local);
            var point = new Vector2(local.x - root.Rect.rect.xMin, root.Rect.rect.yMax - local.y);
            bool inside = new Rect(Vector2.zero, root.Rect.rect.size).Contains(point);
            if (current.type == EventType.MouseDown)
            {
                if (focused != inside) { focused = inside; keys.Clear(); pendingInput.Add(new JObject { ["kind"] = "focus", ["phase"] = inside ? "focus" : "blur" }); }
            }
            if (inside && (current.type == EventType.MouseDown || current.type == EventType.MouseUp || current.type == EventType.MouseMove || current.type == EventType.MouseDrag || current.type == EventType.ScrollWheel))
            {
                if (current.button != 0 && current.type != EventType.ScrollWheel) return;
                pendingInput.Add(new JObject { ["kind"] = "pointer", ["phase"] = current.type == EventType.MouseDown ? "down" : current.type == EventType.MouseUp ? "up" : current.type == EventType.ScrollWheel ? "wheel" : "move", ["x"] = point.x, ["y"] = point.y,
                    ["metadata"] = new JObject { ["deltaY"] = current.delta.y * 24 } });
                if (current.type != EventType.MouseMove) current.Use();
            }
            else if (focused && (current.type == EventType.KeyDown || current.type == EventType.KeyUp))
            {
                string code = KeyCodeName(current.keyCode); if (code == null) return;
                bool repeat = current.type == EventType.KeyDown && !keys.Add(code);
                if (current.type == EventType.KeyUp) keys.Remove(code);
                pendingInput.Add(new JObject { ["kind"] = "keyboard", ["phase"] = current.type == EventType.KeyDown ? "down" : "up", ["code"] = code, ["key"] = current.character == 0 ? current.keyCode.ToString() : current.character.ToString(), ["repeat"] = repeat });
                current.Use();
            }
        }

        void OnApplicationFocus(bool active)
        {
            if (!active && vm != null) { focused = false; keys.Clear(); pendingInput.Add(new JObject { ["kind"] = "focus", ["phase"] = "blur" }); }
        }

        static string KeyCodeName(KeyCode code)
        {
            if (code >= KeyCode.A && code <= KeyCode.Z) return "Key" + code.ToString().ToUpperInvariant();
            if (code >= KeyCode.Alpha0 && code <= KeyCode.Alpha9) return "Digit" + ((int)code - (int)KeyCode.Alpha0);
            switch (code)
            {
                case KeyCode.Return: case KeyCode.KeypadEnter: return "Enter";
                case KeyCode.LeftControl: return "ControlLeft"; case KeyCode.RightControl: return "ControlRight";
                case KeyCode.LeftShift: return "ShiftLeft"; case KeyCode.RightShift: return "ShiftRight";
                case KeyCode.LeftArrow: return "ArrowLeft"; case KeyCode.RightArrow: return "ArrowRight";
                case KeyCode.UpArrow: return "ArrowUp"; case KeyCode.DownArrow: return "ArrowDown";
                case KeyCode.Space: case KeyCode.Escape: case KeyCode.PageDown: case KeyCode.PageUp: return code.ToString();
                default: return null;
            }
        }

        byte[] Bridge(string method, string payload, byte[] bytes)
        {
            if (method == "read_bytes") return LoadBytes(payload.StartsWith("store://", StringComparison.Ordinal) ? payload : ResourcePath(payload));
            if (method == "write_bytes") { AtomicWrite(StoragePath(payload), bytes); return Encoding.UTF8.GetBytes("true"); }
            var args = JObject.Parse(payload);
            if (method == "resource_create") return Json(CreateResource(args, bytes));
            return Json(new JObject { ["value"] = Call(method, args) });
        }
        static byte[] Json(JToken value) => Encoding.UTF8.GetBytes(value.ToString(Formatting.None));

        JToken Call(string method, JObject args)
        {
            string id = args.Value<string>("id"); nodes.TryGetValue(id ?? "", out var node);
            switch (method)
            {
                case "embedded_open": return embeddedRequest;
                case "embedded_event": pendingStoryMessages.Add((JObject)args.DeepClone()); break;
                case "clock": return Time.realtimeSinceStartupAsDouble * 1000;
                case "ready": readyPending = true; break;
                case "log":
                    string text = args.Value<string>("text"); string level = args.Value<string>("level");
                    if (level == "error") Debug.LogError(text, this); else if (level == "warn") Debug.LogWarning(text, this); else Debug.Log(text, this); break;
                case "container_size": return new JObject { ["width"] = root.Rect.rect.width, ["height"] = root.Rect.rect.height };
                case "frame_rate":
                    if (controlApplicationFrameRate) { if (!changedFrameRate) previousFrameRate = Application.targetFrameRate; changedFrameRate = true; Application.targetFrameRate = Math.Clamp(args.Value<int>("value"), 0, 240); }
                    break;
                case "node_create":
                    if (nodes.ContainsKey(id)) throw new InvalidOperationException("Duplicate projection node " + id);
                    var item = new GameObject(args.Value<string>("name") ?? id, typeof(RectTransform)).AddComponent<ProjectionNode>();
                    item.gameObject.layer = gameObject.layer;
                    item.Initialize(this, id, args.Value<string>("kind")); item.Rect.SetParent(nodes[args.Value<string>("parent") ?? "root"].Rect, false); nodes.Add(id, item);
                    if (item.Kind == "stage") stage = item; break;
                case "node_destroy": if (node && node != root) RemoveNode(node); break;
                case "node_clear": if (node) foreach (var child in nodes.Values.Where(n => n && n.Rect.parent == node.Rect).ToArray()) RemoveNode(child); break;
                case "node_parent": if (node && node != root) node.Rect.SetParent(args["parent"] == null ? null : nodes[args.Value<string>("parent")].Rect, false); break;
                case "node_visible": if (node) node.gameObject.SetActive(args.Value<bool>("visible")); break;
                case "node_transform": if (node) node.ApplyTransform((JObject)args["transform"]); break;
                case "node_text": if (node) node.ApplyText(args.Value<string>("text") ?? "", args["style"] as JObject ?? new JObject(), args.Value<bool?>("rich") ?? false); break;
                case "node_sprite":
                    resources.TryGetValue(args.Value<string>("resource") ?? "", out var resource);
                    if (node) node.ApplySprite(resource, args["options"] as JObject ?? new JObject()); break;
                case "node_metadata": if (node) node.Metadata = (JObject)args["metadata"]; break;
                case "node_box": if (node) node.ApplyBox((JObject)args["style"]); break;
                case "node_control": if (node) node.Metadata["control"] = args["control"]; break;
                case "hit_test":
                    var point = (JObject)args["point"]; var p = new Vector3(point.Value<float>("x"), -point.Value<float>("y"));
                    if (stage) p = stage.Rect.TransformPoint(new Vector3(stage.Rect.rect.xMin + p.x, stage.Rect.rect.yMax + p.y));
                    return Hit(node, p, args["options"] as JObject ?? new JObject());
                case "measure_text": return MeasureText(args);
                case "font_register":
                    var options = (JObject)args["options"]; fonts[options.Value<string>("id")] = (options.Value<string>("family"), resources[args.Value<string>("resource")].font); RefreshFonts(); break;
                case "font_unregister": fonts.Remove(id); RefreshFonts(); break;
                case "resource_release": if (resources.TryGetValue(id, out var released)) { if (released.texture) Destroy(released.texture); resources.Remove(id); } break;
                case "file_exists": return args.Value<string>("path").StartsWith("store://", StringComparison.Ordinal) ? File.Exists(StoragePath(args.Value<string>("path"))) : Resources.Load<TextAsset>(contentPrefix + "/" + ResourcePath(args.Value<string>("path"))) != null;
                case "file_mkdir": Directory.CreateDirectory(StoragePath(args.Value<string>("path"))); break;
                case "file_delete": File.Delete(StoragePath(args.Value<string>("path"))); break;
                case "file_move": MoveFile(StoragePath(args.Value<string>("from")), StoragePath(args.Value<string>("to"))); break;
                case "file_list":
                    var directory = StoragePath(args.Value<string>("path")); var list = new JArray();
                    if (Directory.Exists(directory)) foreach (var file in Directory.GetFiles(directory)) { var info = new FileInfo(file); list.Add(new JObject { ["path"] = file.Substring(storageRoot.Length + 1).Replace('\\', '/'), ["size"] = info.Length, ["mtime"] = new DateTimeOffset(info.LastWriteTimeUtc).ToUnixTimeMilliseconds() }); }
                    return list;
                case "audio_create": case "audio_play": case "audio_pause": case "audio_stop": case "audio_volume": case "audio_loop": case "audio_rate": case "audio_seek": case "audio_position": case "audio_dispose": case "audio_bus_volume": return AudioCall(method, args);
                case "quit": stopRequested = true; break;
                case "startup_error":
                    var error = new InvalidOperationException(args.Value<string>("message"));
                    Debug.LogException(error, this); failurePending = error; stopRequested = true; break;
                case "destroy": ReleaseProjection(); break;
                default: throw new NotSupportedException("Unsupported Unity host operation: " + method);
            }
            return null;
        }

        JObject CreateResource(JObject args, byte[] bytes)
        {
            string kind = args.Value<string>("kind"), hash = Hash(bytes);
            if (kind == "sha256") return new JObject { ["value"] = hash };
            string id = args.Value<string>("id"); if (resources.ContainsKey(id)) throw new InvalidOperationException("Duplicate native resource " + id);
            var resource = new Resource { id = id, kind = kind }; var value = new JObject { ["id"] = id, ["kind"] = kind };
            try
            {
                switch (kind)
                {
                    case "texture": case "spriteFrame": case "renderTexture":
                        resource.texture = new Texture2D(2, 2, TextureFormat.RGBA32, false);
                        if (!ImageConversion.LoadImage(resource.texture, bytes)) throw new InvalidDataException("Unity could not decode QPK image " + id);
                        value["width"] = resource.texture.width; value["height"] = resource.texture.height; break;
                    case "audio": resource.audio = Resources.Load<AudioClip>("QuaMedia/" + hash); if (!resource.audio) throw new InvalidDataException("Missing QPK-derived imported audio " + hash); value["duration"] = resource.audio.length * 1000; break;
                    case "font": resource.font = Resources.Load<Font>("QuaMedia/" + hash); if (!resource.font) throw new InvalidDataException("Missing QPK-derived imported font " + hash); break;
                    case "video": resource.video = Resources.Load<VideoClip>("QuaMedia/" + hash); if (!resource.video) throw new InvalidDataException("Missing QPK-derived imported video " + hash); value["width"] = resource.video.width; value["height"] = resource.video.height; break;
                    default: throw new NotSupportedException("Unsupported Unity resource kind " + kind);
                }
                resources.Add(id, resource); return new JObject { ["value"] = value };
            }
            catch { if (resource.texture) Destroy(resource.texture); throw; }
        }

        JToken AudioCall(string method, JObject args)
        {
            string id = args.Value<string>("id"); audio.TryGetValue(id ?? "", out var handle);
            if (method == "audio_bus_volume") { buses[args.Value<string>("bus")] = args.Value<float>("volume"); foreach (var item in audio.Values) ApplyVolume(item); foreach (var item in nodes.Values) if (item) item.ApplyMasterVolume(); return null; }
            if (method == "audio_create")
            {
                if (handle != null) throw new InvalidOperationException("Duplicate audio handle " + id);
                var owned = new GameObject("Qua audio " + id); owned.transform.SetParent(root.Rect, false);
                owned.layer = gameObject.layer;
                var source = owned.AddComponent<AudioSource>(); source.playOnAwake = false; source.clip = resources[args.Value<string>("resource")].audio;
                if (!source.clip) { Destroy(owned); throw new InvalidDataException("Audio resource has no clip"); }
                var options = args["options"] as JObject ?? new JObject();
                handle = new AudioHandle { source = source, bus = options.Value<string>("bus") ?? "master", volume = ProjectionNode.Number(options, "volume", 1) };
                source.loop = options.Value<bool?>("loop") ?? false; source.pitch = Math.Clamp(ProjectionNode.Number(options, "playbackRate", 1), .25f, 4);
                audio.Add(id, handle); ApplyVolume(handle); return null;
            }
            if (handle == null) return null;
            var itemSource = handle.source;
            switch (method)
            {
                case "audio_play": if (handle.paused) itemSource.UnPause(); else if (!handle.playing) itemSource.Play(); handle.paused = false; handle.playing = true; break;
                case "audio_pause": itemSource.Pause(); handle.playing = false; handle.paused = true; break;
                case "audio_stop": itemSource.Stop(); handle.playing = false; handle.paused = false; break;
                case "audio_volume": handle.volume = args.Value<float>("value"); ApplyVolume(handle); break;
                case "audio_loop": itemSource.loop = args.Value<bool>("value"); break;
                case "audio_rate": itemSource.pitch = Math.Clamp(args.Value<float>("value"), .25f, 4); break;
                case "audio_seek": itemSource.time = Math.Clamp(args.Value<float>("value") / 1000, 0, Math.Max(0, itemSource.clip.length - .001f)); break;
                case "audio_position": return itemSource.time * 1000;
                case "audio_dispose": itemSource.Stop(); Destroy(itemSource.gameObject); audio.Remove(id); return null;
            }
            handle.endsAt = AudioSettings.dspTime + (itemSource.clip.length - itemSource.time) / itemSource.pitch;
            return null;
        }
        void ApplyVolume(AudioHandle handle) { float master = buses.TryGetValue("master", out var m) ? m : 1; float bus = handle.bus == "master" ? 1 : buses.TryGetValue(handle.bus, out var v) ? v : 1; handle.source.volume = Mathf.Clamp01(handle.volume * master * bus); }

        JToken Hit(ProjectionNode node, Vector3 point, JObject options)
        {
            if (!node || !node.gameObject.activeInHierarchy) return null;
            Vector2 local = node.Rect.InverseTransformPoint(point);
            bool contains = node.Rect.rect.Contains(local);
            if (node.GetComponent<RectMask2D>() && !contains) return null;
            foreach (var child in nodes.Values.Where(n => n && n.Rect.parent == node.Rect).OrderByDescending(n => n.Rect.GetSiblingIndex())) { var found = Hit(child, point, options); if (found != null) return found; }
            if (!contains || node == root) return null;
            if (options.Value<string>("metadataKey") is string key && node.Metadata[key] == null) return null;
            if (options["metadataKeys"] is JArray names && !names.Any(name => node.Metadata[name.Value<string>()] != null)) return null;
            return node.Id;
        }
        JObject MeasureText(JObject args)
        {
            var style = args["style"] as JObject ?? new JObject(); var font = ResolveFont(style.Value<string>("fontFamily"));
            int size = Math.Max(1, Mathf.RoundToInt(ProjectionNode.Number(style, "fontSize", 24)));
            var settings = new TextGenerationSettings { font = font, fontSize = size, lineSpacing = ProjectionNode.Number(style, "lineHeight", size * 1.2f) / (size * 1.2f), generationExtents = new Vector2(ProjectionNode.Number(args, "maxWidth", 10000), 10000), scaleFactor = 1, richText = false, horizontalOverflow = HorizontalWrapMode.Wrap, verticalOverflow = VerticalWrapMode.Overflow, textAnchor = TextAnchor.UpperLeft, color = Color.white, pivot = new Vector2(0, 1) };
            var generator = new TextGenerator(); string text = args.Value<string>("text") ?? "";
            return new JObject { ["width"] = generator.GetPreferredWidth(text, settings), ["height"] = generator.GetPreferredHeight(text, settings) };
        }
        internal Font ResolveFont(string family)
        {
            foreach (string candidate in (family ?? "").Split(','))
            {
                string wanted = candidate.Trim().Trim('\'', '"');
                var registered = fonts.Values.FirstOrDefault(item => string.Equals(item.family, wanted, StringComparison.OrdinalIgnoreCase)).font;
                if (registered) return registered;
            }
            return Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        }
        void RefreshFonts() { foreach (var node in nodes.Values) if (node) node.RefreshFont(); }
        internal void WarnOnce(string key, string message) { if (warnings.Add(key)) Debug.LogWarning(message, this); }
        static string Hash(byte[] bytes) { using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(); }
        string LoadText(string path) => Encoding.UTF8.GetString(LoadBytes(path));
        byte[] LoadBytes(string path)
        {
            if (path.StartsWith("store://", StringComparison.Ordinal)) return File.ReadAllBytes(StoragePath(path));
            ValidateRelative(path); var asset = Resources.Load<TextAsset>(contentPrefix + "/" + path);
            if (!asset) throw new FileNotFoundException("Missing QuaEngine packaged resource", path);
            return asset.bytes;
        }
        static string ResourcePath(string path) { if (!path.StartsWith("qua://", StringComparison.Ordinal)) throw new InvalidDataException("Invalid Unity resource scheme"); string relative = path.Substring(6); ValidateRelative(relative); return relative; }
        string StoragePath(string path)
        {
            if (!path.StartsWith("store://", StringComparison.Ordinal)) throw new InvalidDataException("Read-only resource path");
            string relative = path.Substring(8); ValidateRelative(relative); string full = Path.GetFullPath(Path.Combine(storageRoot, relative));
            if (!full.StartsWith(storageRoot + Path.DirectorySeparatorChar, StringComparison.Ordinal)) throw new InvalidDataException("Storage path escaped its namespace");
            for (var p = full; p != null && p.StartsWith(storageRoot, StringComparison.Ordinal); p = Path.GetDirectoryName(p))
                if ((File.Exists(p) || Directory.Exists(p)) && (File.GetAttributes(p) & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("Symlinks are not allowed in module storage");
            return full;
        }
        static void ValidateRelative(string path) { if (string.IsNullOrEmpty(path) || path.Contains('\\') || path.Contains(':') || path.Contains('\0') || path.Split('/').Any(part => part == "" || part == "." || part == "..")) throw new InvalidDataException("Invalid module-relative path"); }
        static void MoveFile(string source, string destination) { Directory.CreateDirectory(Path.GetDirectoryName(destination)); if (File.Exists(destination)) File.Replace(source, destination, null); else File.Move(source, destination); }
        static void AtomicWrite(string path, byte[] bytes) { Directory.CreateDirectory(Path.GetDirectoryName(path)); string temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp"; try { File.WriteAllBytes(temp, bytes); MoveFile(temp, path); } finally { if (File.Exists(temp)) File.Delete(temp); } }
        void RemoveNode(ProjectionNode node) { foreach (var child in nodes.Values.Where(n => n && n.Rect.parent == node.Rect).ToArray()) RemoveNode(child); nodes.Remove(node.Id); node.gameObject.SetActive(false); Destroy(node.gameObject); }
        void ReleaseProjection()
        {
            foreach (var item in audio.Values) { if (item.source) { item.source.Stop(); Destroy(item.source.gameObject); } } audio.Clear();
            foreach (var node in nodes.Values.Where(n => n && n != root).ToArray()) if (node) Destroy(node.gameObject);
            foreach (var resource in resources.Values) if (resource.texture) Destroy(resource.texture);
            resources.Clear(); nodes.Clear(); fonts.Clear(); buses.Clear(); stage = null;
        }
        void Release()
        {
            vm?.Dispose(); vm = null; ReleaseProjection();
            if (root) { root.gameObject.SetActive(false); Destroy(root.gameObject); root = null; }
            pendingInput.Clear(); keys.Clear(); focused = false; stopRequested = false;
            readyPending = false; failurePending = null;
            if (changedFrameRate) { Application.targetFrameRate = previousFrameRate; changedFrameRate = false; }
        }
    }
}
