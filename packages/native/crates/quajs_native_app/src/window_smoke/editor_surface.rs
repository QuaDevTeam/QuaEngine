//! Owns a native Core Animation context for the lifetime of the WGPU surface.
use std::ffi::c_void;

extern "C" {
    fn qua_editor_surface_create(width: f64, height: f64, scale: f64, id: *mut u32) -> *mut c_void;
    fn qua_editor_surface_layer(handle: *mut c_void) -> *mut c_void;
    fn qua_editor_surface_destroy(handle: *mut c_void);
}

#[derive(Debug)]
pub(super) struct EditorSurface(*mut c_void);

impl EditorSurface {
    pub(super) fn create(width: f64, height: f64, scale: f64) -> Result<Self, String> {
        let mut context_id = 0;
        // Called only from winit's main-thread initialize. The opaque owner
        // retains both CAContext and CAMetalLayer until WGPU has been dropped.
        let handle = unsafe { qua_editor_surface_create(width, height, scale, &mut context_id) };
        if handle.is_null() {
            return Err("This macOS host does not support native compositor embedding".into());
        }
        super::editor_preview::publish_surface(context_id, width, height);
        Ok(Self(handle))
    }
}

impl crate::product_window::NativeProductSurfaceSource for EditorSurface {
    fn create_surface(
        &self,
        instance: &wgpu::Instance,
    ) -> Result<wgpu::Surface<'static>, wgpu::CreateSurfaceError> {
        // EditorSurface must outlive NativeProductWindowRuntime, which owns the
        // WGPU surface. The runtime drops that surface before its source.
        unsafe {
            instance.create_surface_unsafe(wgpu::SurfaceTargetUnsafe::CoreAnimationLayer(
                qua_editor_surface_layer(self.0),
            ))
        }
    }
}

impl Drop for EditorSurface {
    fn drop(&mut self) {
        super::editor_preview::clear_surface();
        unsafe { qua_editor_surface_destroy(self.0) };
    }
}
