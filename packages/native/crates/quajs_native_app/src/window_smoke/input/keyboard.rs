use serde_json::{json, Value};
use winit::event::ElementState;
use winit::keyboard::KeyCode;

pub(super) fn build_keyboard_input_command_payload(
    code: KeyCode,
    state: ElementState,
    repeat: bool,
    timestamp: u64,
) -> Option<Value> {
    let command = resolve_keyboard_command(code, state, repeat)?;
    let code_name = key_code_name(code)?;
    Some(json!({
        "command": command,
        "device": "keyboard",
        "source": format!("keyboard:{code_name}"),
        "repeat": repeat,
        "pressed": state == ElementState::Pressed,
        "timestamp": timestamp,
        "metadata": {
            "code": code_name,
        },
    }))
}

fn resolve_keyboard_command(
    code: KeyCode,
    phase: ElementState,
    repeat: bool,
) -> Option<&'static str> {
    if repeat {
        return None;
    }
    match (code, phase) {
        (KeyCode::Enter, ElementState::Pressed)
        | (KeyCode::Space, ElementState::Pressed)
        | (KeyCode::ArrowRight, ElementState::Pressed)
        | (KeyCode::ArrowDown, ElementState::Pressed)
        | (KeyCode::PageDown, ElementState::Pressed) => Some("advance"),
        (KeyCode::ControlLeft | KeyCode::ControlRight, ElementState::Pressed) => Some("skip:start"),
        (KeyCode::ControlLeft | KeyCode::ControlRight, ElementState::Released) => Some("skip:stop"),
        (KeyCode::KeyF, ElementState::Pressed) => Some("fastForward:start"),
        (KeyCode::KeyF, ElementState::Released) => Some("fastForward:stop"),
        (KeyCode::KeyA, ElementState::Pressed) => Some("auto:toggle"),
        (KeyCode::ArrowUp, ElementState::Pressed) => Some("choice:previous"),
        (KeyCode::Escape, ElementState::Pressed) => Some("ui:cancel"),
        _ => None,
    }
}

fn key_code_name(code: KeyCode) -> Option<&'static str> {
    match code {
        KeyCode::Enter => Some("Enter"),
        KeyCode::Space => Some("Space"),
        KeyCode::ArrowRight => Some("ArrowRight"),
        KeyCode::ArrowDown => Some("ArrowDown"),
        KeyCode::PageDown => Some("PageDown"),
        KeyCode::ControlLeft => Some("ControlLeft"),
        KeyCode::ControlRight => Some("ControlRight"),
        KeyCode::KeyF => Some("KeyF"),
        KeyCode::KeyA => Some("KeyA"),
        KeyCode::ArrowUp => Some("ArrowUp"),
        KeyCode::Escape => Some("Escape"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_default_keyboard_input_command_payloads() {
        let advance =
            build_keyboard_input_command_payload(KeyCode::Space, ElementState::Pressed, false, 42)
                .expect("space advances");

        assert_eq!(advance["command"], "advance");
        assert_eq!(advance["source"], "keyboard:Space");
        assert_eq!(advance["pressed"], true);
        assert_eq!(advance["repeat"], false);
        assert_eq!(advance["timestamp"], 42);
        assert_eq!(advance["metadata"]["code"], "Space");

        assert_eq!(
            build_keyboard_input_command_payload(
                KeyCode::ControlLeft,
                ElementState::Pressed,
                false,
                42
            )
            .expect("ctrl starts skip")["command"],
            "skip:start",
        );
        assert_eq!(
            build_keyboard_input_command_payload(
                KeyCode::ControlLeft,
                ElementState::Released,
                false,
                42,
            )
            .expect("ctrl release stops skip")["command"],
            "skip:stop",
        );
        assert!(build_keyboard_input_command_payload(
            KeyCode::KeyA,
            ElementState::Pressed,
            true,
            42,
        )
        .is_none());
    }
}
