# Include this from the parent build. It never replaces project()/targets or runpaths.
get_filename_component(QUA_NATIVE_SDK_ROOT "${CMAKE_CURRENT_LIST_DIR}" ABSOLUTE)
if(NOT APPLE)
  message(FATAL_ERROR "This exported Qua Native SDK is a macOS host binary")
endif()
add_library(QuaNative::Dynamic SHARED IMPORTED)
set_target_properties(QuaNative::Dynamic PROPERTIES
  IMPORTED_LOCATION "${QUA_NATIVE_SDK_ROOT}/lib/libquajs_native.dylib"
  INTERFACE_INCLUDE_DIRECTORIES "${QUA_NATIVE_SDK_ROOT}/include")
add_library(QuaNative::Static STATIC IMPORTED)
set_target_properties(QuaNative::Static PROPERTIES
  IMPORTED_LOCATION "${QUA_NATIVE_SDK_ROOT}/lib/libquajs_native.a"
  INTERFACE_INCLUDE_DIRECTORIES "${QUA_NATIVE_SDK_ROOT}/include"
  INTERFACE_LINK_LIBRARIES "-framework ApplicationServices;-framework CoreGraphics;-framework CoreVideo;-framework Carbon;-framework CoreFoundation;-framework AppKit;-framework Foundation;-framework AudioToolbox;-framework CoreAudio;-framework QuartzCore;-framework Metal;-framework JavaScriptCore;objc;iconv")
