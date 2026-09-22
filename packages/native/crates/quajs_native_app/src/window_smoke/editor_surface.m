// Native compositor hosting. No IOSurface/image export or CPU pixel readback.
#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>
#import <QuartzCore/CAMetalLayer.h>

// The remote-layer API used by Chromium's own macOS compositor. These SPI
// selectors are checked at runtime; unavailable hosts fail without a fallback.
@interface NSObject (QuaRemoteContext)
+ (instancetype)contextWithCGSConnection:(uint32_t)connection options:(NSDictionary *)options;
- (uint32_t)contextId;
- (void)setLayer:(CALayer *)layer;
- (void)invalidate;
@end
extern uint32_t CGSMainConnectionID(void);

@interface QuaEditorSurface : NSObject
@property(nonatomic, strong) id context;
@property(nonatomic, strong) CAMetalLayer *metal;
@end
@implementation QuaEditorSurface
@end

void *qua_editor_surface_create(double width, double height, double scale, uint32_t *contextId) {
    Class contextClass = NSClassFromString(@"CAContext");
    if (![NSThread isMainThread] || ![contextClass respondsToSelector:@selector(contextWithCGSConnection:options:)])
        return NULL;
    QuaEditorSurface *surface = [QuaEditorSurface new];
    surface.context = [contextClass contextWithCGSConnection:CGSMainConnectionID() options:@{}];
    if (!surface.context || ![surface.context respondsToSelector:@selector(contextId)])
        return NULL;
    surface.metal = [CAMetalLayer layer];
    surface.metal.frame = CGRectMake(0, 0, width, height);
    surface.metal.contentsScale = scale;
    surface.metal.opaque = YES;
    [surface.context setLayer:surface.metal];
    [CATransaction flush];
    *contextId = [surface.context contextId];
    return (__bridge_retained void *)surface;
}

void *qua_editor_surface_layer(void *handle) {
    return (__bridge void *)((__bridge QuaEditorSurface *)handle).metal;
}

void qua_editor_surface_destroy(void *handle) {
    QuaEditorSurface *surface = (__bridge_transfer QuaEditorSurface *)handle;
    [surface.context setLayer:nil];
    [surface.context invalidate];
    [CATransaction flush];
}
