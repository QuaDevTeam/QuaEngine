#ifndef QUA_NATIVE_H
#define QUA_NATIVE_H
#include <stdint.h>
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
/* ABI 1. UTF-8 has explicit byte lengths, no NUL terminator. All handles are
 * owner-thread only. Surface sessions must be created/used/destroyed on the
 * macOS main thread. Never call the SDK from signal handlers. No callbacks,
 * event-loop ownership, application exit or global logging initialization.
 * Return: 0 success; -1 contract/runtime error; -2 panic (abort that handle).
 * last_error is thread-local and valid until the next status-returning call.
 * Output APIs return required byte count and only write when capacity suffices.
 * Poll removes an event only after a successful full copy. */
uint32_t qua_native_abi_version(void);
size_t qua_native_last_error(uint8_t *output, size_t capacity);
size_t qua_native_describe(uint8_t *output, size_t capacity);
/* config: {moduleDirectory,moduleManifestSha256,storageDirectory}. Pin the hash
 * of module.json in the parent build; a hash read from the same writable module
 * is not an independent trust decision. Each handle owns an isolated JSC VM. */
int32_t qua_native_create(const uint8_t *config, size_t length, uint64_t *handle);
/* open/cancel use qua-embedded v1 JSON (<=64 KiB). One open per handle. */
int32_t qua_native_open(uint64_t handle, const uint8_t *request, size_t length);
int32_t qua_native_cancel(uint64_t handle, const uint8_t *request, size_t length);
/* Parent timer drives jobs/rendering, then drains ready/result/error/closed.
 * Suspend the timer when hidden only if pausing narrative timers is intended.
 * On an SDK error call close and continue bounded tick/poll, then abort on timeout. */
int32_t qua_native_tick(uint64_t handle);
size_t qua_native_poll(uint64_t handle, uint8_t *output, size_t capacity);
int32_t qua_native_close(uint64_t handle);
/* destroy refuses an active session; close + tick until closed first.
 * abort force-evicts: it provides no result/persistence guarantee. */
int32_t qua_native_destroy(uint64_t handle);
int32_t qua_native_abort(uint64_t handle);
/* macOS desktop: parent retains and configures its own CAMetalLayer, sets
 * framebufferOnly=NO and drawableSize to physical width/height; keeps it alive
 * until closed/destroy/abort. Attach once before open. No private CAContext SPI.
 * SDK never reparents/releases the parent's view/layer. Resize passes physical
 * pixels + backing scale; input x/y are view-local points, top-left origin. */
int32_t qua_native_attach_metal_layer(uint64_t handle, void *layer, uint32_t width, uint32_t height, double scale);
int32_t qua_native_resize(uint64_t handle, uint32_t width, uint32_t height, double scale);
/* Input: {type:"pointer",phase:"press"|"release"|"move",x,y},
 * {type:"advance"}, {type:"focus",focused:boolean}. Route only focused view
 * input. Keyboard shortcuts/IME/wheel/gamepad are not yet in ABI 1. */
int32_t qua_native_input(uint64_t handle, const uint8_t *input, size_t length);
#ifdef __cplusplus
}
#endif
#endif
