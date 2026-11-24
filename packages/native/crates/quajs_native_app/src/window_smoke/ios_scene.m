#import <UIKit/UIKit.h>

// Quack emits a single application-window scene. Winit 0.30 owns the view,
// controller, UIWindow and events; UIKit owns scene connection and geometry.
@interface QuaGameSceneDelegate : UIResponder <UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@end

static __weak UIWindow *gameWindow;
static __weak UIWindowScene *gameScene;

static void attachWindow(void) {
    UIWindow *window = gameWindow;
    UIWindowScene *scene = gameScene;
    if (!window || !scene) return;
    window.windowScene = scene;
    window.frame = scene.coordinateSpace.bounds;
    [(QuaGameSceneDelegate *)scene.delegate setWindow:window];
    [window makeKeyWindow];
}

// Called on the main thread with Winit's borrowed UiKitWindowHandle.ui_view.
void qua_ios_bind_scene(void *viewPointer) {
    UIView *view = (__bridge UIView *)viewPointer;
    gameWindow = view.window;
    attachWindow();
}

void qua_ios_view_safe_area(void *viewPointer, double *insets) {
    UIView *view = (__bridge UIView *)viewPointer;
    UIEdgeInsets safe = view.safeAreaInsets;
    insets[0] = safe.top;
    insets[1] = safe.right;
    insets[2] = safe.bottom;
    insets[3] = safe.left;
}

@implementation QuaGameSceneDelegate
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session
      options:(UISceneConnectionOptions *)options {
    if ([scene isKindOfClass:UIWindowScene.class]) {
        gameScene = (UIWindowScene *)scene;
        attachWindow();
    }
}

- (void)sceneDidDisconnect:(UIScene *)scene {
    if (gameScene == scene) {
        self.window = nil;
        gameScene = nil;
    }
}
@end
