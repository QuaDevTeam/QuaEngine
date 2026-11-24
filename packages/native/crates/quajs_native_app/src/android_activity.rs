use std::cell::RefCell;
use std::ffi::CString;
use std::io::{self, Read};
use std::path::Path;
use winit::error::EventLoopError;
use winit::event_loop::EventLoop;
use winit::platform::android::{activity::AndroidApp, EventLoopBuilderExtAndroid};

thread_local! {
    static ACTIVITY: RefCell<Option<AndroidApp>> = const { RefCell::new(None) };
}

// The NativeActivity glue calls this on its application thread. All APK reads and
// window operations run there; workers receive verified bytes, never this handle.
#[no_mangle]
fn android_main(app: AndroidApp) {
    ACTIVITY.with(|activity| activity.replace(Some(app)));
    let _ = crate::logging::init_native_logging();
    if let Err(error) = crate::run() {
        eprintln!("QuaEngine startup failed: {error}");
    }
    ACTIVITY.with(|activity| activity.take());
}

pub fn event_loop() -> Result<EventLoop<()>, EventLoopError> {
    ACTIVITY.with(|activity| {
        EventLoop::builder()
            .with_android_app(
                activity
                    .borrow()
                    .as_ref()
                    .expect("NativeActivity app thread")
                    .clone(),
            )
            .build()
    })
}

pub fn private_data_directory() -> Option<std::path::PathBuf> {
    ACTIVITY.with(|activity| activity.borrow().as_ref()?.internal_data_path())
}

pub fn read_asset(path: &Path) -> io::Result<Vec<u8>> {
    let path = CString::new(path.as_os_str().as_encoded_bytes())?;
    ACTIVITY.with(|activity| {
        let borrow = activity.borrow();
        let manager = borrow
            .as_ref()
            .ok_or_else(|| io::Error::other("APK read outside the application thread"))?
            .asset_manager();
        let mut asset = manager.open(&path).ok_or_else(|| {
            io::Error::new(io::ErrorKind::NotFound, path.to_string_lossy().into_owned())
        })?;
        if asset.length() > 1024 * 1024 * 1024 {
            return Err(io::Error::other("Packaged resource exceeds 1 GiB"));
        }
        let mut bytes = Vec::with_capacity(asset.length());
        asset.read_to_end(&mut bytes)?;
        Ok(bytes)
    })
}
