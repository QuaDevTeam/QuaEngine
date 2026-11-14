using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.Video;

namespace QuaEngine.Unity
{
    // Native presentation handles only. All narrative state stays in QuickJS.
    internal sealed class ProjectionNode : MonoBehaviour
    {
        internal string Id;
        internal string Kind;
        internal JObject Metadata = new JObject();
        internal JObject TransformProjection = new JObject();
        internal JObject TextStyle = new JObject();
        internal RectTransform Rect;
        internal float Z;
        internal QuaEngineHost Host;
        Text text;
        RawImage image;
        Image box;
        readonly List<Image> borders = new List<Image>();
        VideoPlayer video;
        RenderTexture videoTexture;
        string videoResource;
        double? lastVideoSeek;
        double? pendingVideoSeek;
        float videoVolume = 1;
        bool videoMuted;

        internal void Initialize(QuaEngineHost host, string id, string kind)
        {
            Host = host; Id = id; Kind = kind; Rect = GetComponent<RectTransform>();
            Rect.anchorMin = Rect.anchorMax = new Vector2(0, 1); Rect.pivot = new Vector2(0, 1);
        }

        internal void ApplyTransform(JObject value)
        {
            foreach (var property in value.Properties()) TransformProjection[property.Name] = property.Value.DeepClone();
            var p = TransformProjection;
            float width = Number(p, "width", Rect.rect.width), height = Number(p, "height", Rect.rect.height);
            float ax = Number(p, "anchorX"), ay = Number(p, "anchorY");
            Rect.pivot = new Vector2(ax, 1 - ay); Rect.sizeDelta = new Vector2(width, height);
            Rect.anchoredPosition = new Vector2(Number(p, "x") + width * ax, -Number(p, "y") - height * ay);
            Rect.localScale = new Vector3(Number(p, "scaleX", 1), Number(p, "scaleY", 1), 1);
            Rect.localRotation = Quaternion.Euler(0, 0, -Number(p, "rotation"));
            var group = GetComponent<CanvasGroup>() ?? gameObject.AddComponent<CanvasGroup>();
            group.alpha = Mathf.Clamp01(Number(p, "opacity", 1)); group.blocksRaycasts = false;
            Z = Number(p, "zIndex");
            if (value["clip"] is JObject)
            {
                if (!GetComponent<RectMask2D>()) gameObject.AddComponent<RectMask2D>();
                Host.WarnOnce("clip", "Unity clips to node bounds; inset clip rectangles need a custom projection plugin.");
            }
            if (Rect.parent != null)
                foreach (var child in Rect.parent.GetComponentsInChildren<ProjectionNode>(false).Where(n => n.Rect.parent == Rect.parent).OrderBy(n => n.Z)) child.Rect.SetAsLastSibling();
        }

        RectTransform GraphicRect(string name)
        {
            var child = new GameObject(name, typeof(RectTransform));
            child.layer = gameObject.layer;
            var rect = (RectTransform)child.transform; rect.SetParent(Rect, false);
            rect.anchorMin = Vector2.zero; rect.anchorMax = Vector2.one; rect.offsetMin = rect.offsetMax = Vector2.zero;
            return rect;
        }

        internal void ApplyText(string value, JObject style, bool rich)
        {
            if (!text) { text = GraphicRect("Text").gameObject.AddComponent<Text>(); text.raycastTarget = false; }
            TextStyle = style; text.text = value; text.supportRichText = rich;
            text.font = Host.ResolveFont(style.Value<string>("fontFamily"));
            text.fontSize = Mathf.Max(1, Mathf.RoundToInt(Number(style, "fontSize", 24)));
            text.color = ColorValue(style["color"], Color.white);
            text.horizontalOverflow = HorizontalWrapMode.Wrap; text.verticalOverflow = VerticalWrapMode.Overflow;
            text.lineSpacing = Number(style, "lineHeight", text.fontSize * 1.2f) / (text.fontSize * 1.2f);
            var vertical = style.Value<string>("verticalAlign") ?? "top";
            var align = style.Value<string>("align") ?? "left";
            int row = vertical == "bottom" ? 6 : vertical == "center" ? 3 : 0;
            int col = align == "right" ? 2 : align == "center" ? 1 : 0;
            text.alignment = (TextAnchor)(row + col);
            if (style["padding"] is JObject pad)
            {
                text.rectTransform.offsetMin = new Vector2(Number(pad, "left"), Number(pad, "bottom"));
                text.rectTransform.offsetMax = new Vector2(-Number(pad, "right"), -Number(pad, "top"));
            }
            if (Number(style, "letterSpacing") != 0) Host.WarnOnce("letterSpacing", "uGUI Text does not implement authored letter spacing.");
        }

        internal void RefreshFont() { if (text) text.font = Host.ResolveFont(TextStyle.Value<string>("fontFamily")); }

        internal void ApplyBox(JObject style)
        {
            if (!box) { box = GraphicRect("Box").gameObject.AddComponent<Image>(); box.raycastTarget = false; box.transform.SetAsFirstSibling(); }
            box.color = ColorValue(style["backgroundColor"], Color.clear);
            while (borders.Count < 4) { var border = GraphicRect("Border").gameObject.AddComponent<Image>(); border.raycastTarget = false; borders.Add(border); }
            var names = new[] { "Top", "Right", "Bottom", "Left" };
            for (int i = 0; i < 4; i++)
            {
                var border = borders[i]; var rect = border.rectTransform;
                float width = Number(style, "border" + names[i] + "Width", Number(style, "borderWidth"));
                border.color = ColorValue(style["border" + names[i] + "Color"] ?? style["borderColor"], Color.clear);
                border.gameObject.SetActive(width > 0);
                if (i == 0 || i == 2) { rect.anchorMin = new Vector2(0, i == 0 ? 1 : 0); rect.anchorMax = new Vector2(1, i == 0 ? 1 : 0); rect.pivot = new Vector2(.5f, i == 0 ? 1 : 0); rect.sizeDelta = new Vector2(0, width); }
                else { rect.anchorMin = new Vector2(i == 1 ? 1 : 0, 0); rect.anchorMax = new Vector2(i == 1 ? 1 : 0, 1); rect.pivot = new Vector2(i == 1 ? 1 : 0, .5f); rect.sizeDelta = new Vector2(width, 0); }
                rect.anchoredPosition = Vector2.zero;
            }
            foreach (var key in new[] { "backgroundGradient", "boxShadow", "borderRadius", "shape" })
                if (style[key] != null && style[key].ToString() != "0") Host.WarnOnce(key, "Unity base projection does not implement " + key + ".");
        }

        internal void ApplySprite(QuaEngineHost.Resource resource, JObject options)
        {
            if (!image) { image = GraphicRect("Media").gameObject.AddComponent<RawImage>(); image.raycastTarget = false; image.transform.SetAsFirstSibling(); }
            StopVideo(resource?.id);
            image.texture = resource?.texture;
            image.color = ColorValue(options["tint"], Color.white) * new Color(1, 1, 1, Number(options, "opacity", 1));
            image.uvRect = new Rect(0, 0, 1, 1);
            if (resource?.texture && options["frame"] is JObject frame)
                image.uvRect = new Rect(Number(frame, "x") / resource.texture.width,
                    1 - (Number(frame, "y") + Number(frame, "height")) / resource.texture.height,
                    Number(frame, "width") / resource.texture.width, Number(frame, "height") / resource.texture.height);
            if (resource?.video)
            {
                if (!video)
                {
                    video = gameObject.AddComponent<VideoPlayer>(); videoResource = resource.id;
                    video.playOnAwake = false; video.clip = resource.video; video.renderMode = VideoRenderMode.RenderTexture;
                    videoTexture = new RenderTexture((int)Math.Max(1, resource.video.width), (int)Math.Max(1, resource.video.height), 0);
                    video.targetTexture = videoTexture; image.texture = videoTexture;
                    video.prepareCompleted += PreparedVideo;
                    video.Prepare();
                }
                else image.texture = videoTexture;
                var intent = options["video"] as JObject ?? new JObject();
                video.isLooping = intent.Value<bool?>("loop") ?? true;
                video.playbackSpeed = Number(intent, "playbackRate", 1);
                videoMuted = intent.Value<bool?>("muted") ?? false;
                videoVolume = Number(intent, "volume", 1);
                ApplyMasterVolume();
                if (intent["seekMs"] != null && lastVideoSeek != Number(intent, "seekMs"))
                { lastVideoSeek = Number(intent, "seekMs"); pendingVideoSeek = lastVideoSeek; ApplyVideoSeek(); }
            }
            foreach (var key in new[] { "filter", "mask", "composition", "lighting", "slice" })
                if (options[key] != null) Host.WarnOnce("sprite:" + key, "Unity base sprite projection does not implement " + key + ".");
            if (options.Value<string>("blendMode") is string blend && blend != "normal") Host.WarnOnce("blend", "Unity base sprites use normal alpha blending.");
        }

        internal void ApplyMasterVolume()
        {
            if (!video || video.audioTrackCount == 0) return;
            video.SetDirectAudioMute(0, videoMuted);
            video.SetDirectAudioVolume(0, Mathf.Clamp01(videoVolume * Host.MasterVolume));
        }

        void PreparedVideo(VideoPlayer player)
        {
            if (player != video) return;
            ApplyMasterVolume(); ApplyVideoSeek(); player.Play();
        }

        void ApplyVideoSeek()
        {
            if (!video || !video.isPrepared || !video.canSetTime || !pendingVideoSeek.HasValue) return;
            video.time = pendingVideoSeek.Value / 1000.0; pendingVideoSeek = null;
        }

        void StopVideo(string keep = null)
        {
            if (video && videoResource == keep) return;
            if (video) { video.prepareCompleted -= PreparedVideo; video.Stop(); Destroy(video); video = null; }
            if (videoTexture) { videoTexture.Release(); Destroy(videoTexture); videoTexture = null; }
            videoResource = null;
            lastVideoSeek = null;
            pendingVideoSeek = null;
        }
        void OnDestroy() { StopVideo(); }
        internal static float Number(JObject value, string key, float fallback = 0) => value[key]?.Type == JTokenType.Integer || value[key]?.Type == JTokenType.Float ? value.Value<float>(key) : fallback;
        internal static Color ColorValue(JToken value, Color fallback)
        {
            string text = value?.Value<string>();
            if (text == "transparent") return Color.clear;
            if (text != null && ColorUtility.TryParseHtmlString(text, out var color)) return color;
            if (text != null && text.StartsWith("rgba(") && text.EndsWith(")"))
            {
                var parts = text.Substring(5, text.Length - 6).Split(',');
                if (parts.Length == 4 && parts.All(p => float.TryParse(p, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out _)))
                    return new Color(float.Parse(parts[0], System.Globalization.CultureInfo.InvariantCulture) / 255, float.Parse(parts[1], System.Globalization.CultureInfo.InvariantCulture) / 255,
                        float.Parse(parts[2], System.Globalization.CultureInfo.InvariantCulture) / 255, float.Parse(parts[3], System.Globalization.CultureInfo.InvariantCulture));
            }
            return fallback;
        }
    }
}
