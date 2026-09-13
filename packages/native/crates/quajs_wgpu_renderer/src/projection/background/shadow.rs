use crate::projection::safety::is_safe_native_color_literal;
use crate::render_graph::composite::CompositeDropShadow;

/// The projection contains the inside of Web's `drop-shadow(...)` function.
/// Parentheses are retained only for a single color token, never arbitrary CSS.
pub(crate) fn parse_drop_shadow(value: &str) -> Option<CompositeDropShadow> {
    if value.len() > 256 || value.chars().any(char::is_control) {
        return None;
    }
    let mut tokens = Vec::new();
    let mut start = None;
    let mut depth = 0u8;
    for (index, ch) in value.char_indices() {
        if ch.is_whitespace() && depth == 0 {
            if let Some(start) = start.take() {
                tokens.push(&value[start..index]);
            }
            continue;
        }
        start.get_or_insert(index);
        match ch {
            '(' if depth == 0 => depth = 1,
            ')' if depth == 1 => depth = 0,
            '(' | ')' | ',' if depth == 0 => return None,
            '(' => return None,
            _ => {}
        }
    }
    if depth != 0 {
        return None;
    }
    if let Some(start) = start {
        tokens.push(&value[start..]);
    }
    let mut lengths = Vec::new();
    let mut color = None;
    for (index, token) in tokens.iter().enumerate() {
        if let Some(n) = length(token) {
            lengths.push(n);
        } else if color.is_none()
            && (index == 0 || index + 1 == tokens.len())
            && is_safe_native_color_literal(token)
            && !token.eq_ignore_ascii_case("currentColor")
        {
            color = Some(token.to_string());
        } else {
            return None;
        }
    }
    if !(2..=3).contains(&lengths.len()) || lengths.get(2).is_some_and(|n| *n < 0.0) {
        return None;
    }
    Some(CompositeDropShadow {
        offset: [lengths[0], lengths[1]],
        sigma: lengths.get(2).copied().unwrap_or(0.0),
        color: color.unwrap_or_else(|| "black".into()),
    })
}

fn length(value: &str) -> Option<f64> {
    let raw = value
        .strip_suffix("px")
        .or_else(|| (value == "0").then_some(value))?;
    let n = raw.parse::<f64>().ok()?;
    (n.is_finite() && n.abs() <= 4096.0).then_some(n)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn consumes_web_inner_value_with_optional_blur_and_color() {
        let shadow = parse_drop_shadow("12px -18px 24px rgba(0, 0, 0, 0.55)").unwrap();
        assert_eq!(shadow.offset, [12.0, -18.0]);
        assert_eq!(shadow.sigma, 24.0);
        assert_eq!(shadow.color, "rgba(0, 0, 0, 0.55)");
        assert_eq!(parse_drop_shadow("red 0 2px").unwrap().color, "red");
        assert_eq!(parse_drop_shadow("0 2px").unwrap().color, "black");
        for value in [
            "drop-shadow(1px 2px red)",
            "1px 2px -1px black",
            "1px 2px 3px 4px black",
            "1 2 red",
            "1e99px 0",
            "0 0 red, 0 0 blue",
            "0 0 url(bad)",
        ] {
            assert!(parse_drop_shadow(value).is_none(), "{value}");
        }
    }
}
