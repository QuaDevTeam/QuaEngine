/// Direction for the CSS `steps()` easing function.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StepsDirection {
    Start,
    End,
}

/// Full CSS-spec cubic bezier: solves `t` from `x` using Newton-Raphson with
/// bisection fallback, then evaluates `y(t)`.  Mirrors the WebKit UnitBezier
/// solver and matches the browser's native `transition` engine.
pub fn css_bezier(progress: f64, x1: f64, y1: f64, x2: f64, y2: f64) -> f64 {
    let p = progress.clamp(0.0, 1.0);
    bezier_axis(solve_bezier_parameter(p, x1, x2), y1, y2)
}

/// Resolves a CSS easing keyword string to an output value in `[0, 1]`.
/// Handles `"linear"`, `"ease"`, `"ease-in"`, `"ease-out"`, `"ease-in-out"`,
/// `"cubic-bezier(x1, y1, x2, y2)"`, `"steps(n)"`, `"steps(n, start)"`, and
/// `"steps(n, end)"`.  Returns `None` for unrecognised keywords, letting the
/// caller fall back to its own legacy aliases.
pub fn ease_for_css_keyword(progress: f64, keyword: &str) -> Option<f64> {
    let p = progress.clamp(0.0, 1.0);
    match keyword {
        "linear" => Some(p),
        "ease" => Some(css_bezier(p, 0.25, 0.1, 0.25, 1.0)),
        "ease-in" => Some(css_bezier(p, 0.42, 0.0, 1.0, 1.0)),
        "ease-out" => Some(css_bezier(p, 0.0, 0.0, 0.58, 1.0)),
        "ease-in-out" => Some(css_bezier(p, 0.42, 0.0, 0.58, 1.0)),
        _ => parse_steps_keyword(p, keyword).or_else(|| parse_cubic_bezier_keyword(p, keyword)),
    }
}

/// CSS `steps(n, direction)` easing.
///
/// - `StepsDirection::End` (default): output snaps at the *end* of each
///   interval — `floor(progress * n) / n`.
/// - `StepsDirection::Start`: output snaps at the *start* of each interval —
///   `ceil(progress * n) / n`.
pub fn steps(progress: f64, n: u32, direction: StepsDirection) -> f64 {
    let p = progress.clamp(0.0, 1.0);
    if n == 0 {
        return p;
    }
    let n_f = n as f64;
    match direction {
        StepsDirection::End => (p * n_f).floor() / n_f,
        StepsDirection::Start => (p * n_f).ceil() / n_f,
    }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

fn parse_steps_keyword(progress: f64, keyword: &str) -> Option<f64> {
    let body = keyword.strip_prefix("steps(")?.strip_suffix(')')?;
    let mut parts = body.splitn(2, ',');
    let n: u32 = parts.next()?.trim().parse().ok()?;
    let direction = match parts.next().map(str::trim) {
        None | Some("end") => StepsDirection::End,
        Some("start") => StepsDirection::Start,
        _ => return None,
    };
    Some(steps(progress, n, direction))
}

/// Parses `cubic-bezier(x1, y1, x2, y2)` following the same whitespace rules
/// as render-core's regex: one optional space after each comma, nowhere else.
fn parse_cubic_bezier_keyword(progress: f64, keyword: &str) -> Option<f64> {
    let body = keyword.strip_prefix("cubic-bezier(")?.strip_suffix(')')?;
    let mut values = [0.0f64; 4];
    let mut count = 0;
    for part in body.split(',') {
        if count >= 4 {
            return None;
        }
        // render-core allows a leading space only after a comma (i.e. not on
        // the first token and not trailing anywhere).
        let part = if count == 0 { part } else { part.trim_start() };
        if part.is_empty()
            || part.trim() != part
            || !part
                .chars()
                .all(|c| c.is_ascii_digit() || c == '-' || c == '.')
        {
            return None;
        }
        values[count] = part.parse::<f64>().ok().filter(|v| v.is_finite())?;
        count += 1;
    }
    if count != 4 {
        return None;
    }
    Some(css_bezier(
        progress, values[0], values[1], values[2], values[3],
    ))
}

/// One axis of a cubic bezier anchored at `(0, 0)` and `(1, 1)`.
fn bezier_axis(t: f64, p1: f64, p2: f64) -> f64 {
    let inverse = 1.0 - t;
    3.0 * inverse * inverse * t * p1 + 3.0 * inverse * t * t * p2 + t * t * t
}

fn bezier_axis_derivative(t: f64, p1: f64, p2: f64) -> f64 {
    let inverse = 1.0 - t;
    3.0 * inverse * inverse * p1 + 6.0 * inverse * t * (p2 - p1) + 3.0 * t * t * (1.0 - p2)
}

/// Finds the curve parameter whose x equals `x`: Newton-Raphson while the
/// derivative cooperates, bisection otherwise.  CSS guarantees `x1` and `x2`
/// lie in `0..=1`, so `x(t)` is monotonic and bisection always converges.
fn solve_bezier_parameter(x: f64, x1: f64, x2: f64) -> f64 {
    let mut t = x;
    for _ in 0..8 {
        let error = bezier_axis(t, x1, x2) - x;
        if error.abs() < 1e-7 {
            return t;
        }
        let derivative = bezier_axis_derivative(t, x1, x2);
        if derivative.abs() < 1e-6 {
            break;
        }
        t = (t - error / derivative).clamp(0.0, 1.0);
    }
    let (mut low, mut high) = (0.0f64, 1.0f64);
    for _ in 0..32 {
        t = (low + high) * 0.5;
        if bezier_axis(t, x1, x2) < x {
            low = t;
        } else {
            high = t;
        }
    }
    t
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() <= 1e-6,
            "expected {expected}, got {actual}"
        );
    }

    #[test]
    fn css_bezier_matches_webkit_unit_bezier_reference_values() {
        // Reference values from the canonical WebKit UnitBezier solver.
        close(css_bezier(0.1, 0.25, 0.1, 0.25, 1.0), 0.094_796_306);
        close(css_bezier(0.5, 0.25, 0.1, 0.25, 1.0), 0.802_403_388);
        close(css_bezier(0.9, 0.25, 0.1, 0.25, 1.0), 0.994_316_478);
        // Boundary conditions.
        close(css_bezier(0.0, 0.25, 0.1, 0.25, 1.0), 0.0);
        close(css_bezier(1.0, 0.25, 0.1, 0.25, 1.0), 1.0);
        // ease-out-expo: cubic-bezier(0.19, 1, 0.22, 1).
        close(css_bezier(0.1, 0.19, 1.0, 0.22, 1.0), 0.479_754_619);
        close(css_bezier(0.5, 0.19, 1.0, 0.22, 1.0), 0.977_824_592);
        close(css_bezier(0.9, 0.19, 1.0, 0.22, 1.0), 0.999_911_198);
    }

    #[test]
    fn ease_for_css_keyword_recognises_standard_keywords() {
        close(ease_for_css_keyword(0.5, "linear").unwrap(), 0.5);
        close(
            ease_for_css_keyword(0.5, "ease").unwrap(),
            css_bezier(0.5, 0.25, 0.1, 0.25, 1.0),
        );
        close(
            ease_for_css_keyword(0.5, "ease-in").unwrap(),
            css_bezier(0.5, 0.42, 0.0, 1.0, 1.0),
        );
        close(
            ease_for_css_keyword(0.5, "ease-out").unwrap(),
            css_bezier(0.5, 0.0, 0.0, 0.58, 1.0),
        );
        close(
            ease_for_css_keyword(0.5, "ease-in-out").unwrap(),
            css_bezier(0.5, 0.42, 0.0, 0.58, 1.0),
        );
    }

    #[test]
    fn ease_for_css_keyword_parses_cubic_bezier_string() {
        let result = ease_for_css_keyword(0.5, "cubic-bezier(0.19, 1, 0.22, 1)").unwrap();
        close(result, css_bezier(0.5, 0.19, 1.0, 0.22, 1.0));
    }

    #[test]
    fn ease_for_css_keyword_returns_none_for_unknown() {
        assert!(ease_for_css_keyword(0.5, "bounce").is_none());
        assert!(ease_for_css_keyword(0.5, "easeIn").is_none());
        assert!(ease_for_css_keyword(0.5, "cubic-in").is_none());
    }

    #[test]
    fn steps_end_snaps_at_interval_boundaries() {
        close(steps(0.0, 4, StepsDirection::End), 0.0);
        close(steps(0.24, 4, StepsDirection::End), 0.0);
        close(steps(0.25, 4, StepsDirection::End), 0.25);
        close(steps(0.49, 4, StepsDirection::End), 0.25);
        close(steps(0.5, 4, StepsDirection::End), 0.5);
        close(steps(1.0, 4, StepsDirection::End), 1.0);
    }

    #[test]
    fn steps_start_snaps_at_start_of_each_interval() {
        close(steps(0.0, 4, StepsDirection::Start), 0.0);
        close(steps(0.01, 4, StepsDirection::Start), 0.25);
        close(steps(0.25, 4, StepsDirection::Start), 0.25);
        close(steps(0.26, 4, StepsDirection::Start), 0.5);
        close(steps(1.0, 4, StepsDirection::Start), 1.0);
    }

    #[test]
    fn parse_steps_keyword_via_ease_for_css_keyword() {
        close(
            ease_for_css_keyword(0.3, "steps(4)").unwrap(),
            steps(0.3, 4, StepsDirection::End),
        );
        close(
            ease_for_css_keyword(0.3, "steps(4, end)").unwrap(),
            steps(0.3, 4, StepsDirection::End),
        );
        close(
            ease_for_css_keyword(0.3, "steps(4, start)").unwrap(),
            steps(0.3, 4, StepsDirection::Start),
        );
    }
}
