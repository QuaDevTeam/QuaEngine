use std::time::{Duration, Instant};

pub(super) enum GamepadEvent {
    Button(u64, u8, bool),
    Disconnected(u64),
}

// Controllers have no winit button event on desktop or iOS. Poll only while
// the game is interactable. Android buttons arrive in the winit key stream.
#[derive(Default)]
pub(super) struct WindowGamepads {
    #[cfg(target_os = "android")]
    pub(super) android: android::AndroidGamepads,
    next_poll: Option<Instant>,
    active: bool,
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    buttons: std::collections::BTreeMap<u64, u16>,
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    gilrs: std::sync::OnceLock<Option<gilrs::Gilrs>>,
}

impl WindowGamepads {
    pub(super) fn poll(&mut self, active: bool, events: &mut Vec<GamepadEvent>) -> Option<Instant> {
        if !active || cfg!(target_os = "android") {
            self.active = false;
            self.next_poll = None;
            return None;
        }
        let now = Instant::now();
        if self.next_poll.is_some_and(|next| next > now) {
            return self.next_poll;
        }
        let next = now + Duration::from_millis(16);
        self.next_poll = Some(next);

        #[cfg(any(target_os = "macos", target_os = "ios"))]
        {
            type States = std::collections::BTreeMap<u64, u16>;
            extern "C" {
                fn qua_sample_gamepads(
                    context: *mut std::ffi::c_void,
                    sample: extern "C" fn(*mut std::ffi::c_void, u64, u16),
                );
            }
            extern "C" fn sample(states: *mut std::ffi::c_void, id: u64, mask: u16) {
                unsafe { &mut *states.cast::<States>() }.insert(id, mask);
            }
            let mut states = States::new();
            unsafe {
                qua_sample_gamepads((&mut states as *mut States).cast(), sample);
            }
            for (&id, &mask) in &states {
                let previous = self.buttons.get(&id).copied().unwrap_or(0);
                for button in [0, 1, 5, 7, 9, 12, 13, 14, 15] {
                    if (mask ^ previous) & (1 << button) != 0 {
                        events.push(GamepadEvent::Button(id, button, mask & (1 << button) != 0));
                    }
                }
            }
            events.extend(
                self.buttons
                    .keys()
                    .filter(|id| !states.contains_key(id))
                    .map(|id| GamepadEvent::Disconnected(*id)),
            );
            self.buttons = states;
        }
        #[cfg(any(target_os = "windows", target_os = "linux"))]
        {
            use gilrs::{Button, EventType};
            self.gilrs.get_or_init(|| match gilrs::Gilrs::new() {
                Ok(gilrs) => Some(gilrs),
                Err(error) => {
                    log::warn!("Gamepad input unavailable: {error}");
                    None
                }
            });
            let Some(Some(input)) = self.gilrs.get_mut() else {
                return None;
            };
            while let Some(event) = input.next_event() {
                let id = usize::from(event.id) as u64;
                let (button, pressed) = match event.event {
                    EventType::ButtonPressed(button, _) => (button, true),
                    EventType::ButtonReleased(button, _) => (button, false),
                    EventType::Disconnected => {
                        events.push(GamepadEvent::Disconnected(id));
                        continue;
                    }
                    _ => continue,
                };
                let index = match button {
                    Button::South => 0,
                    Button::East => 1,
                    Button::RightTrigger => 5,
                    Button::RightTrigger2 => 7,
                    Button::Start => 9,
                    Button::DPadUp => 12,
                    Button::DPadDown => 13,
                    Button::DPadLeft => 14,
                    Button::DPadRight => 15,
                    _ => continue,
                };
                events.push(GamepadEvent::Button(id, index, pressed));
            }
        }
        if !self.active {
            events.clear();
        }
        self.active = true;
        Some(next)
    }
}

#[cfg(any(test, target_os = "android"))]
mod android;
