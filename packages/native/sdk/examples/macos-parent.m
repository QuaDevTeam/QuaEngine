// clang -fobjc-arc examples/macos-parent.m -Iinclude -Llib -lquajs_native \
//   -framework Cocoa -framework QuartzCore -Wl,-rpath,@executable_path/lib -o parent
// ./parent /absolute/module PINNED_MODULE_JSON_SHA256 /absolute/writable/storage '{}'
#import <Cocoa/Cocoa.h>
#import <QuartzCore/CAMetalLayer.h>
#include "qua_native.h"

static void check(int status) {
    if (!status) return;
    size_t size=qua_native_last_error(NULL,0);
    NSMutableData *data=[NSMutableData dataWithLength:size];
    qua_native_last_error(data.mutableBytes,size);
    fprintf(stderr,"Native SDK: %.*s\n",(int)size,(char*)data.bytes);
}
@interface StoryView:NSView
@property uint64_t session;
@end
@implementation StoryView
- (BOOL)isFlipped {return YES;}
- (BOOL)acceptsFirstResponder {return YES;}
- (BOOL)becomeFirstResponder {[self input:@{@"type":@"focus",@"focused":@YES}];return YES;}
- (BOOL)resignFirstResponder {[self input:@{@"type":@"focus",@"focused":@NO}];return YES;}
- (void)viewDidChangeBackingProperties {[self setFrameSize:self.frame.size];}
- (CALayer*)makeBackingLayer {CAMetalLayer *layer=[CAMetalLayer layer];layer.framebufferOnly=NO;return layer;}
- (void)input:(NSDictionary*)value {
    if(!self.session)return;
    NSData *data=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    check(qua_native_input(self.session,data.bytes,data.length));
}
- (void)pointer:(NSEvent*)event phase:(NSString*)phase {
    NSPoint point=[self convertPoint:event.locationInWindow fromView:nil];
    [self input:@{@"type":@"pointer",@"phase":phase,@"x":@(point.x),@"y":@(point.y)}];
}
- (void)mouseDown:(NSEvent*)event {[self.window makeFirstResponder:self];[self pointer:event phase:@"press"];}
- (void)mouseUp:(NSEvent*)event {[self pointer:event phase:@"release"];}
- (void)mouseDragged:(NSEvent*)event {[self pointer:event phase:@"move"];}
- (void)keyDown:(NSEvent*)event {if(event.keyCode==49||event.keyCode==36)[self input:@{@"type":@"advance"}];else [super keyDown:event];}
- (void)setFrameSize:(NSSize)size {
    [super setFrameSize:size];
    double scale=self.window.backingScaleFactor ?: NSScreen.mainScreen.backingScaleFactor;
    CAMetalLayer *layer=(CAMetalLayer*)self.layer;layer.contentsScale=scale;layer.drawableSize=CGSizeMake(MAX(1,size.width*scale),MAX(1,size.height*scale));
    if(self.session)check(qua_native_resize(self.session,MAX(1,size.width*scale),MAX(1,size.height*scale),scale));
}
@end
@interface Parent:NSObject<NSApplicationDelegate,NSWindowDelegate>
@property NSWindow *window;
@property StoryView *story;
@property NSTextField *status;
@property NSTimer *timer;
@property uint64_t session;
@property NSUInteger ticks;
@property NSUInteger sessionTicks;
@property BOOL closing;
@property BOOL automated;
@property NSString *mode;
@property NSString *sessionId;
@end
@implementation Parent
- (void)applicationDidFinishLaunching:(NSNotification*)notification {
    self.automated=NSProcessInfo.processInfo.arguments.count>5;
    self.mode=self.automated?NSProcessInfo.processInfo.arguments[5]:@"interactive";
    self.window=[[NSWindow alloc]initWithContentRect:NSMakeRect(100,100,920,630) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];
    self.window.title=@"Qua Native Library · Parent Application";self.window.delegate=self;
    NSView *root=self.window.contentView;
    self.status=[NSTextField labelWithString:@"Parent application is running"];
    self.status.frame=NSMakeRect(20,586,880,24);self.status.autoresizingMask=NSViewWidthSizable|NSViewMinYMargin;
    [root addSubview:self.status];
    self.story=[[StoryView alloc]initWithFrame:NSMakeRect(20,60,880,510)];self.story.wantsLayer=YES;
    self.story.autoresizingMask=NSViewWidthSizable|NSViewHeightSizable;[root addSubview:self.story];
    NSArray *titles=@[@"Open story",@"Cancel story",@"Close module"];
    NSArray *actions=@[NSStringFromSelector(@selector(openStory)),NSStringFromSelector(@selector(cancelStory)),NSStringFromSelector(@selector(closeStory))];
    for(NSUInteger i=0;i<titles.count;i++){NSButton *button=[NSButton buttonWithTitle:titles[i] target:self action:NSSelectorFromString(actions[i])];button.frame=NSMakeRect(20+150*i,16,140,30);[root addSubview:button];}
    [self.window makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];
    printf("QUA_NATIVE_PARENT_WINDOW=%ld\n",(long)self.window.windowNumber);fflush(stdout);
    [self openStory];
    self.timer=[NSTimer scheduledTimerWithTimeInterval:1.0/60 repeats:YES block:^(NSTimer *timer){[self tick];}];
}
- (void)openStory {
    if(self.session)return;
    NSArray *args=NSProcessInfo.processInfo.arguments;
    NSDictionary *config=@{@"moduleDirectory":args[1],@"moduleManifestSha256":args[2],@"storageDirectory":args[3]};
    NSData *data=[NSJSONSerialization dataWithJSONObject:config options:0 error:nil];uint64_t handle=0;
    int result=qua_native_create(data.bytes,data.length,&handle);check(result);if(result){if(self.automated)exit(1);return;}
    self.session=handle;self.sessionTicks=0;self.closing=NO;
    NSSize size=self.story.bounds.size;double scale=self.window.backingScaleFactor;
    CAMetalLayer *layer=(CAMetalLayer*)self.story.layer;layer.contentsScale=scale;layer.drawableSize=CGSizeMake(size.width*scale,size.height*scale);
    result=qua_native_attach_metal_layer(handle,(__bridge void*)layer,size.width*scale,size.height*scale,scale);check(result);
    if(result){qua_native_abort(handle);self.session=0;if(self.automated)exit(1);return;}
    self.story.session=handle;
    self.sessionId=NSUUID.UUID.UUIDString;
    NSDictionary *parameters=args.count>4?[NSJSONSerialization JSONObjectWithData:[args[4] dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil]:@{};
    NSDictionary *request=@{@"protocol":@"qua-embedded",@"version":@1,@"type":@"open",@"sessionId":self.sessionId,@"storageNamespace":@"example-account",@"parameters":parameters?:@{}};
    data=[NSJSONSerialization dataWithJSONObject:request options:0 error:nil];result=qua_native_open(handle,data.bytes,data.length);check(result);
    if(result){qua_native_abort(handle);self.session=0;self.story.session=0;if(self.automated)exit(1);}
}
- (void)cancelStory {
    if(!self.session)return;
    NSData *data=[NSJSONSerialization dataWithJSONObject:@{@"protocol":@"qua-embedded",@"version":@1,@"type":@"cancel",@"sessionId":self.sessionId} options:0 error:nil];
    check(qua_native_cancel(self.session,data.bytes,data.length));
}
- (void)closeStory {if(self.session){self.closing=YES;check(qua_native_close(self.session));}}
- (void)tick {
    self.ticks++;self.sessionTicks++;
    if(self.session){
        int result=qua_native_tick(self.session);check(result);
        if(result){qua_native_abort(self.session);self.session=0;self.story.session=0;if(self.automated)exit(1);}
        while(self.session){
            size_t size=qua_native_poll(self.session,NULL,0);if(!size)break;
            NSMutableData *data=[NSMutableData dataWithLength:size];qua_native_poll(self.session,data.mutableBytes,size);
            printf("%.*s\n",(int)size,(char*)data.bytes);fflush(stdout);
            NSDictionary *message=[NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
            if([message[@"type"] isEqual:@"ready"]){
                // The parent remains resizeable and independently owns its controls.
                [self.window setContentSize:NSMakeSize(960,660)];
                if([self.mode isEqual:@"cancel"])[self cancelStory];
                if([self.mode isEqual:@"advance"])[self.story input:@{@"type":@"advance"}];
                if([self.mode isEqual:@"pointer"]){
                    [self.story input:@{@"type":@"pointer",@"phase":@"press",@"x":@20,@"y":@20}];
                    [self.story input:@{@"type":@"pointer",@"phase":@"release",@"x":@20,@"y":@20}];
                }
            }
            if([message[@"type"] isEqual:@"closed"]){check(qua_native_destroy(self.session));self.session=0;self.story.session=0;}
        }
        if([self.mode isEqual:@"close-before-ready"]&&self.sessionTicks==1)[self closeStory];
    }
    self.status.stringValue=[NSString stringWithFormat:@"Parent ticks: %lu · Module %@ · Parent controls remain available",(unsigned long)self.ticks,self.session?@"active":@"closed"];
    if(self.automated&&!self.session&&self.sessionTicks>15){
        printf("QUA_NATIVE_PARENT_OK ticks=%lu\n",(unsigned long)self.ticks);fflush(stdout);
        [self.timer invalidate];[NSApp stop:nil];
        // stop: changes NSApplication state; wake its nextEvent wait as well.
        [NSApp postEvent:[NSEvent otherEventWithType:NSEventTypeApplicationDefined location:NSZeroPoint modifierFlags:0 timestamp:0 windowNumber:0 context:nil subtype:0 data1:0 data2:0] atStart:YES];
        return;
    }
    if(self.automated&&self.sessionTicks>600){if(self.session)qua_native_abort(self.session);fprintf(stderr,"Native parent timeout\n");exit(1);}
}
- (BOOL)windowShouldClose:(NSWindow*)window {
    if(self.session){[self closeStory];return NO;}return YES;
}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication*)app {return YES;}
@end
int main(int argc,const char **argv){@autoreleasepool{
    if(argc<4){fprintf(stderr,"usage: parent MODULE_DIR PINNED_SHA256 STORAGE_DIR [PARAMETERS_JSON] [test|cancel|close-before-ready]\n");return 2;}
    [NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    Parent *parent=[Parent new];NSApp.delegate=parent;[NSApp run];return 0;
}}
