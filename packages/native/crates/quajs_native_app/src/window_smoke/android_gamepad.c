// Winit 0.30 converts every Android joystick MOVE into a touchscreen move and
// drops key source metadata. Observe the public NDK event for the duration of
// that same synchronous callback; the NativeActivity still owns its input queue.
#include <android/input.h>
#include <android/keycodes.h>
#include <stdint.h>

static _Thread_local const AInputEvent *current;
extern int32_t __real_AInputQueue_preDispatchEvent(AInputQueue *, AInputEvent *);
extern void __real_AInputQueue_finishEvent(AInputQueue *, AInputEvent *, int);

int32_t __wrap_AInputQueue_preDispatchEvent(AInputQueue *queue, AInputEvent *event) {
    int32_t result = __real_AInputQueue_preDispatchEvent(queue, event);
    current = result == 0 ? event : 0;
    return result;
}

void __wrap_AInputQueue_finishEvent(AInputQueue *queue, AInputEvent *event, int handled) {
    current = 0;
    __real_AInputQueue_finishEvent(queue, event, handled);
}

struct QuaGamepadSample {
    uint32_t id;
    int32_t kind;
    int32_t button;
    int32_t pressed;
    float hat_x;
    float hat_y;
    float right_trigger;
};

static int standard_button(int key) {
    switch (key) {
        case AKEYCODE_DPAD_CENTER:
        case AKEYCODE_BUTTON_A: return 0;
        case AKEYCODE_BACK:
        case AKEYCODE_BUTTON_B: return 1;
        case AKEYCODE_BUTTON_R1: return 5;
        case AKEYCODE_BUTTON_R2: return 7;
        case AKEYCODE_BUTTON_START: return 9;
        case AKEYCODE_DPAD_UP: return 12;
        case AKEYCODE_DPAD_DOWN: return 13;
        case AKEYCODE_DPAD_LEFT: return 14;
        case AKEYCODE_DPAD_RIGHT: return 15;
        default: return -1;
    }
}

int qua_current_gamepad(struct QuaGamepadSample *out) {
    if (!current) return 0;
    const int source = AInputEvent_getSource(current);
    if ((source & AINPUT_SOURCE_GAMEPAD) != AINPUT_SOURCE_GAMEPAD &&
        (source & AINPUT_SOURCE_JOYSTICK) != AINPUT_SOURCE_JOYSTICK &&
        (source & AINPUT_SOURCE_DPAD) != AINPUT_SOURCE_DPAD) return 0;

    out->id = (uint32_t) AInputEvent_getDeviceId(current);
    out->kind = 0;  // Ignore unmapped controller input, including ordinary sticks.
    if (AInputEvent_getType(current) == AINPUT_EVENT_TYPE_KEY) {
        int action = AKeyEvent_getAction(current);
        out->button = standard_button(AKeyEvent_getKeyCode(current));
        if (out->button >= 0 && (action == AKEY_EVENT_ACTION_DOWN || action == AKEY_EVENT_ACTION_UP)) {
            out->kind = 1;
            out->pressed = action == AKEY_EVENT_ACTION_DOWN;
        }
    } else if (AInputEvent_getType(current) == AINPUT_EVENT_TYPE_MOTION) {
        int action = AMotionEvent_getAction(current) & AMOTION_EVENT_ACTION_MASK;
        if (action == AMOTION_EVENT_ACTION_CANCEL) {
            out->kind = 3;
        } else if (action == AMOTION_EVENT_ACTION_MOVE && AMotionEvent_getPointerCount(current)) {
            out->kind = 2;
            out->hat_x = AMotionEvent_getAxisValue(current, AMOTION_EVENT_AXIS_HAT_X, 0);
            out->hat_y = AMotionEvent_getAxisValue(current, AMOTION_EVENT_AXIS_HAT_Y, 0);
            float trigger = AMotionEvent_getAxisValue(current, AMOTION_EVENT_AXIS_RTRIGGER, 0);
            float gas = AMotionEvent_getAxisValue(current, AMOTION_EVENT_AXIS_GAS, 0);
            out->right_trigger = trigger > gas ? trigger : gas;
        }
    }
    return 1;
}
