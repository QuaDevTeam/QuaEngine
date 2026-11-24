#import <AppKit/AppKit.h>

// Called on the winit main thread. Copy the screen profile name while the
// NSScreen owns it. A disconnected monitor leaves all probe fields unknown.
void qua_monitor_color(uint32_t displayId, double *potential, double *current,
                       char *profile, size_t profileCapacity) {
    for (NSScreen *screen in NSScreen.screens) {
        NSNumber *number = screen.deviceDescription[@"NSScreenNumber"];
        if (!number || number.unsignedIntValue != displayId) continue;
        if (@available(macOS 10.15, *)) {
            *potential = screen.maximumPotentialExtendedDynamicRangeColorComponentValue;
            *current = screen.maximumExtendedDynamicRangeColorComponentValue;
        }
        NSString *name = screen.colorSpace.localizedName;
        if (![name getCString:profile maxLength:profileCapacity encoding:NSUTF8StringEncoding])
            profile[0] = '\0';
        return;
    }
}
