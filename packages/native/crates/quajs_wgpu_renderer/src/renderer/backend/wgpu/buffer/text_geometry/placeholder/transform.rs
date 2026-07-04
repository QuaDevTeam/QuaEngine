use crate::render_graph::{TextTransformDrawParam, WhiteSpaceDrawParam};

pub(super) fn transform_placeholder_text(text: &str, transform: TextTransformDrawParam) -> String {
    match transform {
        TextTransformDrawParam::None => text.to_string(),
        TextTransformDrawParam::Uppercase => text.to_uppercase(),
        TextTransformDrawParam::Lowercase => text.to_lowercase(),
        TextTransformDrawParam::Capitalize => {
            let mut capitalize_next = true;
            let mut output = String::new();
            for character in text.chars() {
                if character.is_whitespace() {
                    capitalize_next = true;
                    output.push(character);
                } else if capitalize_next {
                    output.extend(character.to_uppercase());
                    capitalize_next = false;
                } else {
                    output.extend(character.to_lowercase());
                }
            }
            output
        }
    }
}

pub(super) fn normalized_source_lines(text: &str, white_space: WhiteSpaceDrawParam) -> Vec<String> {
    match white_space {
        WhiteSpaceDrawParam::Normal | WhiteSpaceDrawParam::NoWrap => {
            vec![collapse_placeholder_whitespace(text)]
        }
        WhiteSpaceDrawParam::Pre => text.lines().map(ToString::to_string).collect(),
        WhiteSpaceDrawParam::PreLine => text.lines().map(collapse_placeholder_whitespace).collect(),
        WhiteSpaceDrawParam::PreWrap => text.lines().map(ToString::to_string).collect(),
    }
}

pub(super) fn placeholder_words(line: &str) -> Vec<String> {
    line.split_whitespace()
        .filter(|word| !word.is_empty())
        .map(ToString::to_string)
        .collect()
}

pub(super) fn preserved_placeholder_segments(line: &str) -> Vec<String> {
    let mut segments = Vec::new();
    let mut current = String::new();
    let mut current_is_whitespace = None;

    for character in line.chars() {
        let is_whitespace = character.is_whitespace();
        if current_is_whitespace == Some(is_whitespace) {
            current.push(character);
            continue;
        }

        if !current.is_empty() {
            segments.push(std::mem::take(&mut current));
        }
        current.push(character);
        current_is_whitespace = Some(is_whitespace);
    }

    if !current.is_empty() {
        segments.push(current);
    }
    segments
}

fn collapse_placeholder_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}
