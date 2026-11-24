use super::GamepadEvent;
use std::collections::BTreeMap;

#[repr(C)]
#[derive(Default)]
struct Sample {
    id: u32,
    kind: i32,
    button: i32,
    pressed: i32,
    hat_x: f32,
    hat_y: f32,
    right_trigger: f32,
}

#[derive(Default)]
pub(crate) struct AndroidGamepads {
    // Devices may report the same D-pad or trigger as both a key and an axis.
    // Only the union's edges reach the semantic dispatcher.
    held: BTreeMap<u32, (u16, u16)>,
}

impl AndroidGamepads {
    #[cfg(target_os = "android")]
    pub(crate) fn current_events(&mut self) -> Option<Vec<GamepadEvent>> {
        extern "C" {
            fn qua_current_gamepad(output: *mut Sample) -> i32;
        }
        let mut sample = Sample::default();
        (unsafe { qua_current_gamepad(&mut sample) } != 0).then(|| self.update(sample))
    }

    #[cfg(target_os = "android")]
    pub(crate) fn clear(&mut self) {
        self.held.clear();
    }

    fn update(&mut self, sample: Sample) -> Vec<GamepadEvent> {
        if sample.kind == 3 {
            self.held.remove(&sample.id);
            return vec![GamepadEvent::Disconnected(u64::from(sample.id))];
        }
        let (mut keys, mut axes) = self.held.get(&sample.id).copied().unwrap_or_default();
        let previous = keys | axes;
        match sample.kind {
            1 => {
                if sample.pressed != 0 {
                    keys |= 1 << sample.button
                } else {
                    keys &= !(1 << sample.button)
                }
            }
            2 => {
                axes = 0;
                for (button, pressed) in [
                    (12, sample.hat_y < -0.5),
                    (13, sample.hat_y > 0.5),
                    (14, sample.hat_x < -0.5),
                    (15, sample.hat_x > 0.5),
                    (7, sample.right_trigger > 0.5),
                ] {
                    if pressed {
                        axes |= 1 << button;
                    }
                }
            }
            _ => return vec![],
        }
        let held = keys | axes;
        if held == 0 {
            self.held.remove(&sample.id);
        } else {
            self.held.insert(sample.id, (keys, axes));
        }
        let mut events = vec![];
        for button in [0, 1, 5, 7, 9, 12, 13, 14, 15] {
            let bit = 1 << button;
            if (previous ^ held) & bit != 0 {
                events.push(GamepadEvent::Button(
                    u64::from(sample.id),
                    button,
                    held & bit != 0,
                ));
            }
        }
        events
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hat_trigger_and_duplicate_key_edges() {
        let mut pads = AndroidGamepads::default();
        let motion = |y, trigger| Sample {
            kind: 2,
            id: 4,
            hat_y: y,
            right_trigger: trigger,
            ..Default::default()
        };
        let key = |pressed| Sample {
            kind: 1,
            id: 4,
            button: 7,
            pressed,
            ..Default::default()
        };
        assert!(matches!(
            pads.update(motion(-1.0, 0.0)).as_slice(),
            [GamepadEvent::Button(4, 12, true)]
        ));
        assert!(matches!(
            pads.update(motion(0.0, 1.0)).as_slice(),
            [
                GamepadEvent::Button(4, 7, true),
                GamepadEvent::Button(4, 12, false)
            ]
        ));
        assert!(pads.update(key(1)).is_empty());
        assert!(pads.update(motion(0.0, 0.0)).is_empty());
        assert!(matches!(
            pads.update(key(0)).as_slice(),
            [GamepadEvent::Button(4, 7, false)]
        ));
        assert!(pads.held.is_empty());
    }
}
