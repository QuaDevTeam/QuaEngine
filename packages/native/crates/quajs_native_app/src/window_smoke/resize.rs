use winit::dpi::PhysicalSize;

use super::bootstrap::NativeWindowSmokeResizeReport;

#[derive(Default)]
pub(super) struct NativeWindowSmokeResizeState {
    count: usize,
    last_physical_size: Option<PhysicalSize<u32>>,
}

impl NativeWindowSmokeResizeState {
    pub(super) fn count(&self) -> usize {
        self.count
    }

    pub(super) fn last_physical_size(&self) -> Option<PhysicalSize<u32>> {
        self.last_physical_size
    }

    pub(super) fn record_resize(&mut self, report: NativeWindowSmokeResizeReport) {
        self.count = self.count.saturating_add(1);
        self.last_physical_size = Some(PhysicalSize::new(
            report.physical_width,
            report.physical_height,
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_resize_count_and_last_physical_size() {
        let mut state = NativeWindowSmokeResizeState::default();

        assert_eq!(state.count(), 0);
        assert_eq!(state.last_physical_size(), None);

        state.record_resize(NativeWindowSmokeResizeReport {
            physical_width: 800,
            physical_height: 600,
        });
        state.record_resize(NativeWindowSmokeResizeReport {
            physical_width: 1280,
            physical_height: 720,
        });

        assert_eq!(state.count(), 2);
        assert_eq!(
            state.last_physical_size(),
            Some(PhysicalSize::new(1280, 720))
        );
    }
}
