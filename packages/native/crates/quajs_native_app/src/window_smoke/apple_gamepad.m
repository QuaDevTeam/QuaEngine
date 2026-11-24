#import <GameController/GameController.h>
#import <objc/runtime.h>
#include <stdint.h>

// Called on the application's main thread. Keep controller IDs stable across
// disconnections/reordering without retaining disconnected hardware.
void qua_sample_gamepads(void *context, void (*sample)(void *, uint64_t, uint16_t)) {
    static char idKey;
    static uint64_t nextID = 0;
    for (GCController *controller in GCController.controllers) {
        GCExtendedGamepad *pad = controller.extendedGamepad;
        if (!pad) continue;
        NSNumber *identifier = objc_getAssociatedObject(controller, &idKey);
        if (!identifier) {
            identifier = @(nextID++);
            objc_setAssociatedObject(controller, &idKey, identifier, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        }
        uint16_t mask = pad.buttonA.pressed | (pad.buttonB.pressed << 1)
            | (pad.rightShoulder.pressed << 5) | (pad.rightTrigger.pressed << 7)
            | (pad.dpad.up.pressed << 12) | (pad.dpad.down.pressed << 13)
            | (pad.dpad.left.pressed << 14) | (pad.dpad.right.pressed << 15);
        if (@available(macOS 10.15, iOS 13.0, *)) mask |= pad.buttonMenu.pressed << 9;
        sample(context, identifier.unsignedLongLongValue, mask);
    }
}
