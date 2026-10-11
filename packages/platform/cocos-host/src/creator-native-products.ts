export { CREATOR_MAC_AUDIO_SOURCE } from './creator-native-audio-product'
/** Static host product copied into generated workspaces; no repository link or runtime JS loading. */
export const CREATOR_MAC_VIDEO_SOURCE = String.raw`
#import <AVFoundation/AVFoundation.h>
#import <CoreVideo/CoreVideo.h>
#include "bindings/jswrapper/SeApi.h"
#include <algorithm>
#include <cmath>
#include <map>
#include <memory>
#include <vector>

namespace {
struct Video {
    AVPlayer *player = nil;
    AVPlayerItemVideoOutput *output = nil;
    id ended = nil;
    bool loop = false;
    double rate = 1;
    double seek = -1;
    bool seeking = false;
    bool disposed = false;
    CMTime last = kCMTimeInvalid;
    ~Video() {
        [player pause];
        if (ended) [[NSNotificationCenter defaultCenter] removeObserver:ended];
        [ended release];
        [output release];
        [player release];
    }
};
std::map<int, std::shared_ptr<Video>> videos;
int serial = 0;
void field(se::Object *object, const char *name, double value) { object->setProperty(name, se::Value(value)); }
std::shared_ptr<Video> findVideo(const se::ValueArray &args) {
    if (args.empty() || !args[0].isNumber()) return {};
    auto found = videos.find(args[0].toInt32());
    return found == videos.end() ? nullptr : found->second;
}
bool create(se::State &s) {
    if (s.args().size() != 1 || !s.args()[0].isString() || videos.size() >= 8) return false;
    @autoreleasepool {
        auto v = std::make_shared<Video>();
        NSString *path = [NSString stringWithUTF8String:s.args()[0].toString().c_str()];
        // Only Creator-resolved local imported resources, never arbitrary remote content.
        if (![[NSFileManager defaultManager] fileExistsAtPath:path]) return false;
        AVPlayerItem *item = [AVPlayerItem playerItemWithURL:[NSURL fileURLWithPath:path]];
        v->output = [[AVPlayerItemVideoOutput alloc] initWithPixelBufferAttributes:@{(id)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA)}];
        [item addOutput:v->output];
        v->player = [[AVPlayer alloc] initWithPlayerItem:item];
        v->player.actionAtItemEnd = AVPlayerActionAtItemEndPause;
        std::weak_ptr<Video> weak = v;
        v->ended = [[[NSNotificationCenter defaultCenter] addObserverForName:AVPlayerItemDidPlayToEndTimeNotification object:item queue:[NSOperationQueue mainQueue] usingBlock:^(NSNotification *) {
            auto held = weak.lock();
            if (held && !held->disposed && held->loop) {
                [held->player seekToTime:kCMTimeZero toleranceBefore:kCMTimeZero toleranceAfter:kCMTimeZero completionHandler:^(BOOL done) { if (done && !held->disposed) held->player.rate = held->rate; }];
            }
        }] retain];
        int id = ++serial;
        videos[id] = v;
        s.rval().setInt32(id);
    }
    return true;
}
SE_BIND_FUNC(create)
bool project(se::State &s) {
    auto v = findVideo(s.args());
    if (!v || s.args().size() != 6) return false;
    v->loop = s.args()[1].toBoolean();
    v->player.muted = s.args()[2].toBoolean();
    v->player.volume = std::clamp(s.args()[3].toDouble(), 0.0, 1.0);
    v->rate = std::clamp(s.args()[4].toDouble(), 0.25, 4.0);
    double seek = s.args()[5].toDouble();
    if (!std::isfinite(seek) || seek < 0) return false;
    if (v->seek != seek) {
        v->seek = seek;
        v->seeking = true;
        auto held = v;
        [v->player seekToTime:CMTimeMakeWithSeconds(seek / 1000.0, 600) toleranceBefore:kCMTimeZero toleranceAfter:kCMTimeZero completionHandler:^(BOOL done) {
            held->seeking = false;
            if (done && !held->disposed) held->player.rate = held->rate;
        }];
    } else if (!v->seeking) v->player.rate = v->rate;
    return true;
}
SE_BIND_FUNC(project)
bool frame(se::State &s) {
    auto v = findVideo(s.args());
    if (!v) return false;
    @autoreleasepool {
        se::HandleObject result(se::Object::createPlainObject());
        field(result, "positionMs", CMTimeGetSeconds(v->player.currentTime) * 1000);
        double duration = CMTimeGetSeconds(v->player.currentItem.duration);
        field(result, "durationMs", std::isfinite(duration) ? duration * 1000 : 0);
        field(result, "rate", v->player.rate);
        field(result, "playbackRate", v->rate);
        field(result, "loop", v->loop ? 1 : 0);
        field(result, "muted", v->player.muted ? 1 : 0);
        field(result, "volume", v->player.volume);
        field(result, "ready", v->player.currentItem.status == AVPlayerItemStatusReadyToPlay ? 1 : 0);
        field(result, "error", v->player.currentItem.status == AVPlayerItemStatusFailed ? 1 : 0);
        CMTime pts;
        CMTime current = v->player.currentTime;
        CVPixelBufferRef buffer = [v->output copyPixelBufferForItemTime:current itemTimeForDisplay:&pts];
        if (buffer) {
            size_t w = CVPixelBufferGetWidth(buffer), h = CVPixelBufferGetHeight(buffer);
            if (w && h && w <= 4096 && h <= 4096 && w * h <= 8 * 1024 * 1024 && (!CMTIME_IS_VALID(v->last) || CMTimeCompare(pts, v->last) != 0)) {
                CVPixelBufferLockBaseAddress(buffer, kCVPixelBufferLock_ReadOnly);
                const auto *src = static_cast<const uint8_t *>(CVPixelBufferGetBaseAddress(buffer));
                size_t stride = CVPixelBufferGetBytesPerRow(buffer);
                std::vector<uint8_t> rgba(w * h * 4);
                for (size_t y = 0; y < h; ++y) for (size_t x = 0; x < w; ++x) {
                    const auto *pixel = src + y * stride + x * 4;
                    auto *dst = rgba.data() + (y * w + x) * 4;
                    dst[0] = pixel[2]; dst[1] = pixel[1]; dst[2] = pixel[0]; dst[3] = pixel[3];
                }
                CVPixelBufferUnlockBaseAddress(buffer, kCVPixelBufferLock_ReadOnly);
                se::HandleObject bytes(se::Object::createArrayBufferObject(rgba.data(), rgba.size()));
                result->setProperty("pixels", se::Value(bytes));
                field(result, "width", w); field(result, "height", h);
                field(result, "frameMs", CMTimeGetSeconds(pts) * 1000);
                v->last = pts;
            }
            CVPixelBufferRelease(buffer);
        }
        s.rval().setObject(result);
    }
    return true;
}
SE_BIND_FUNC(frame)
bool dispose(se::State &s) {
    if (s.args().size() != 1 || !s.args()[0].isNumber()) return false;
    auto v = findVideo(s.args());
    if (v) { v->disposed = true; [v->player pause]; }
    videos.erase(s.args()[0].toInt32());
    return true;
}
SE_BIND_FUNC(dispose)
}
bool registerQuaCreatorVideo(se::Object *global) {
    se::HandleObject bridge(se::Object::createPlainObject());
    bridge->defineFunction("create", _SE(create));
    bridge->defineFunction("project", _SE(project));
    bridge->defineFunction("frame", _SE(frame));
    bridge->defineFunction("dispose", _SE(dispose));
    global->setProperty("__quaCreatorVideo", se::Value(bridge));
    se::ScriptEngine::getInstance()->addBeforeCleanupHook([]() {
        for (auto &entry : videos) { entry.second->disposed = true; [entry.second->player pause]; }
        videos.clear();
    });
    return true;
}
`
