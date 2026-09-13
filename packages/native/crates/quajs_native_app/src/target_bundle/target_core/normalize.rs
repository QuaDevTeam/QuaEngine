pub(super) fn normalize_package_specifier(specifier: &str) -> String {
    let normalized = strip_reference_suffix(
        specifier
            .trim()
            .trim_start_matches('\0')
            .replace('\\', "/")
            .as_str(),
    );
    if let Some(package_root) = package_root_from_dependency_path(&normalized) {
        return package_root;
    }

    let package_specifier = normalized
        .strip_prefix("npm:")
        .unwrap_or(normalized.as_str());

    if !package_specifier.starts_with('@') {
        let path_root = package_specifier
            .split('/')
            .next()
            .unwrap_or(package_specifier);
        return path_root
            .split("::")
            .next()
            .unwrap_or(path_root)
            .to_string();
    }

    let mut parts = package_specifier.split('/');
    match (parts.next(), parts.next()) {
        (Some(scope), Some(package_name)) => format!("{scope}/{package_name}"),
        _ => package_specifier.to_string(),
    }
}

fn strip_reference_suffix(specifier: &str) -> String {
    let query_index = specifier.find('?');
    let hash_index = specifier.find('#');
    let suffix_index = match (query_index, hash_index) {
        (Some(query), Some(hash)) => Some(query.min(hash)),
        (Some(query), None) => Some(query),
        (None, Some(hash)) => Some(hash),
        (None, None) => None,
    };
    suffix_index
        .map(|index| specifier[..index].to_string())
        .unwrap_or_else(|| specifier.to_string())
}

fn package_root_from_dependency_path(specifier: &str) -> Option<String> {
    let segments: Vec<&str> = specifier
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    for index in (0..segments.len()).rev() {
        if segments[index] != "node_modules" {
            continue;
        }

        if segments.get(index + 1) == Some(&".pnpm") {
            if let Some(package_root) =
                package_root_from_pnpm_segment(segments.get(index + 2).copied())
            {
                return Some(package_root);
            }
        }

        return package_root_from_path_segments(&segments, index + 1);
    }

    if let Some(index) = segments.iter().rposition(|segment| *segment == ".pnpm") {
        return package_root_from_pnpm_segment(segments.get(index + 1).copied());
    }

    None
}

fn package_root_from_path_segments(segments: &[&str], start_index: usize) -> Option<String> {
    let first = segments.get(start_index)?;
    if first.starts_with('@') {
        let second = segments.get(start_index + 1)?;
        return Some(format!("{first}/{second}"));
    }

    Some(first.split("::").next().unwrap_or(first).to_string())
}

fn package_root_from_pnpm_segment(segment: Option<&str>) -> Option<String> {
    let segment = segment?;
    if let Some(without_scope) = segment.strip_prefix('@') {
        let plus_index = without_scope.find('+')?;
        let scoped_name = &without_scope[..plus_index];
        let rest = &without_scope[plus_index + 1..];
        let version_index = rest.find('@')?;
        let package_name = &rest[..version_index];
        return Some(format!("@{scoped_name}/{package_name}"));
    }

    let version_index = segment.find('@')?;
    Some(segment[..version_index].to_string())
}
