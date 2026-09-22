// SPDX-License-Identifier: MPL-2.0
// Core Animation hosts the native process's Metal layer inside Electron's
// NSView hierarchy. JavaScript never receives a texture, bitmap, or frame.
#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>
#include <node_api.h>
#include <cmath>
#include <array>
#include <algorithm>
#include <cstring>

@interface CALayer (QuaRemoteLayer)
@property(nonatomic) uint32_t contextId;
@end

@interface QuaNativePreviewView : NSView
@end
@implementation QuaNativePreviewView
- (BOOL)isFlipped { return YES; }
// The transparent DOM input surface underneath retains focus, pointer capture,
// accessibility and Electron shortcuts. Only presentation is native here.
- (NSView *)hitTest:(NSPoint)point { return nil; }
@end

struct Host {
    QuaNativePreviewView *__strong view;
    CALayer *__strong remote;
    bool closed = false;
};

static napi_value fail(napi_env env, const char *message) {
    napi_throw_error(env, nullptr, message);
    return nullptr;
}
static napi_value nothing(napi_env env) {
    napi_value value;
    napi_get_undefined(env, &value);
    return value;
}
static void detach(Host *host) {
    if (!host || host->closed) return;
    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    host->remote.contextId = 0;
    [host->view removeFromSuperview];
    host->remote = nil;
    host->view = nil;
    host->closed = true;
    [CATransaction commit];
}
static void finalize(napi_env env, void *data, void *hint) {
    auto *host = static_cast<Host *>(data);
    detach(host);
    delete host;
}
static Host *hostArg(napi_env env, napi_value value) {
    void *data = nullptr;
    if (napi_get_value_external(env, value, &data) != napi_ok) return nullptr;
    return static_cast<Host *>(data);
}
static NSView *parentArg(napi_env env, napi_value value) {
    void *data = nullptr;
    size_t size = 0;
    if (napi_get_buffer_info(env, value, &data, &size) != napi_ok || size != sizeof(void *)) return nil;
    void *pointer = nullptr;
    memcpy(&pointer, data, sizeof(pointer));
    // Only trusted Electron main supplies getNativeWindowHandle() (NSView*).
    return (__bridge NSView *)pointer;
}
static napi_value create(napi_env env, napi_callback_info info) {
    if (![NSThread isMainThread]) return fail(env, "Native layer hosting requires the main thread.");
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    uint32_t context = 0;
    if (argc != 1 || napi_get_value_uint32(env, argv[0], &context) != napi_ok || !context)
        return fail(env, "Invalid native compositor context.");
    Class layerClass = NSClassFromString(@"CALayerHost");
    if (!layerClass || ![layerClass instancesRespondToSelector:@selector(setContextId:)])
        return fail(env, "Core Animation remote layer hosting is unavailable.");
    auto *host = new Host();
    host->view = [[QuaNativePreviewView alloc] initWithFrame:NSZeroRect];
    host->view.wantsLayer = YES;
    host->view.layer.masksToBounds = YES;
    host->remote = [layerClass layer];
    host->remote.anchorPoint = CGPointZero;
    host->remote.contextId = context;
    [host->view.layer addSublayer:host->remote];
    napi_value result;
    napi_create_external(env, host, finalize, nullptr, &result);
    return result;
}
static napi_value layout(napi_env env, napi_callback_info info) {
    if (![NSThread isMainThread]) return fail(env, "Native layer layout requires the main thread.");
    size_t argc = 8;
    napi_value argv[8];
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    if (argc != 8) return fail(env, "Invalid native layer layout.");
    Host *host = hostArg(env, argv[0]);
    NSView *parent = parentArg(env, argv[1]);
    if (!host || host->closed || !parent) return fail(env, "Native layer is detached.");
    double values[6];
    for (size_t i = 0; i < 6; ++i) {
        if (napi_get_value_double(env, argv[i + 2], &values[i]) != napi_ok || !std::isfinite(values[i]) || values[i] < 0 || values[i] > 32768)
            return fail(env, "Invalid native layer dimensions.");
    }
    const auto [x, y, width, height, sourceWidth, sourceHeight] = std::array<double, 6>{values[0], values[1], values[2], values[3], values[4], values[5]};
    if (!sourceWidth || !sourceHeight) return fail(env, "Invalid native viewport.");
    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    if (host->view.superview != parent) {
        [host->view removeFromSuperview];
        [parent addSubview:host->view positioned:NSWindowAbove relativeTo:nil];
    }
    const double nativeY = parent.flipped ? y : parent.bounds.size.height - y - height;
    host->view.frame = NSMakeRect(x, nativeY, width, height);
    host->view.hidden = width == 0 || height == 0;
    const double scale = std::min(width / sourceWidth, height / sourceHeight);
    host->remote.bounds = CGRectMake(0, 0, sourceWidth, sourceHeight);
    host->remote.position = CGPointMake((width - sourceWidth * scale) / 2, (height - sourceHeight * scale) / 2);
    host->remote.transform = CATransform3DMakeScale(scale, scale, 1);
    [CATransaction commit];
    return nothing(env);
}
static napi_value destroy(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    if (argc != 1) return fail(env, "Invalid native layer handle.");
    detach(hostArg(env, argv[0]));
    return nothing(env);
}
// Read-only native hierarchy diagnostics for lifecycle/geometry acceptance.
// This stays in Electron main and is not exposed through renderer IPC.
static napi_value inspect(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    NSView *parent = argc == 1 ? parentArg(env, argv[0]) : nil;
    if (!parent) return fail(env, "Invalid native parent.");
    NSMutableArray *views = [NSMutableArray array];
    for (NSView *view in parent.subviews) {
        if (![view isKindOfClass:QuaNativePreviewView.class]) continue;
        CALayer *remote = view.layer.sublayers.firstObject;
        [views addObject:@{@"contextId": @(remote.contextId), @"hidden": @(view.hidden),
            @"x": @(view.frame.origin.x), @"y": @(parent.flipped ? view.frame.origin.y : parent.bounds.size.height - NSMaxY(view.frame)),
            @"width": @(view.frame.size.width), @"height": @(view.frame.size.height)}];
    }
    NSData *data = [NSJSONSerialization dataWithJSONObject:views options:0 error:nil];
    napi_value result;
    napi_create_string_utf8(env, static_cast<const char *>(data.bytes), data.length, &result);
    return result;
}
static napi_value init(napi_env env, napi_value exports) {
    const napi_property_descriptor properties[] = {
        {"create", nullptr, create, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"layout", nullptr, layout, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"destroy", nullptr, destroy, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"inspect", nullptr, inspect, nullptr, nullptr, nullptr, napi_default, nullptr},
    };
    napi_define_properties(env, exports, 4, properties);
    return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
