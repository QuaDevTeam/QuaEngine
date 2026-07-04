use super::super::*;

#[test]
fn replaces_existing_records_by_id() {
    let mut ledger = NativeResourceLedger::new();
    assert!(ledger
        .insert(NativeResourceRecord::new(
            "same",
            NativeResourceKind::Texture
        ))
        .is_none());
    let previous = ledger
        .insert(NativeResourceRecord::new(
            "same",
            NativeResourceKind::AudioBuffer,
        ))
        .unwrap();

    assert_eq!(previous.kind, NativeResourceKind::Texture);
    assert_eq!(
        ledger.get("same").unwrap().kind,
        NativeResourceKind::AudioBuffer
    );
}

#[test]
fn clears_all_records_for_renderer_shutdown() {
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(NativeResourceRecord::new("a", NativeResourceKind::Texture));
    ledger.insert(NativeResourceRecord::new(
        "b",
        NativeResourceKind::AudioHandle,
    ));

    let released = ledger.clear();
    assert_eq!(released.len(), 2);
    assert!(ledger.is_empty());
}
