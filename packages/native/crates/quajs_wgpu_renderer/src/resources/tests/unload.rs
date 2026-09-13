use super::super::*;

#[test]
fn plans_clean_package_unload_for_owned_resources() {
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(
        NativeResourceRecord::new("runtime:image", NativeResourceKind::Texture)
            .owned_by("runtime.extra")
            .memory(128, 2048),
    );
    ledger.insert(
        NativeResourceRecord::new("runtime:ui", NativeResourceKind::UiAst)
            .owned_by("runtime.extra")
            .require_package("runtime.extra")
            .memory(512, 0),
    );

    let plan = ledger.plan_package_unload("runtime.extra");
    assert!(plan.can_unload());
    assert_eq!(plan.releasable.len(), 2);
    assert_eq!(
        plan.releasable_memory,
        ResourceMemory {
            cpu_bytes: 640,
            gpu_bytes: 2048
        }
    );

    let released = ledger.release_package_owned("runtime.extra");
    assert_eq!(released.len(), 2);
    assert!(ledger.is_empty());
}

#[test]
fn blocks_unload_when_foreign_resource_requires_package() {
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(
        NativeResourceRecord::new("runtime:diff", NativeResourceKind::DecodedImage)
            .owned_by("runtime.diff")
            .require_package("base")
            .memory(256, 0),
    );

    let plan = ledger.plan_package_unload("base");
    assert!(!plan.can_unload());
    assert!(plan.releasable.is_empty());
    assert_eq!(plan.blocked.len(), 1);
    assert_eq!(
        plan.blocked[0].reason,
        PackageUnloadBlockerReason::PackageRequiredByForeignResource
    );
    assert_eq!(ledger.release_package_owned("base"), Vec::new());
    assert_eq!(ledger.len(), 1);
}

#[test]
fn blocks_owned_resource_that_still_depends_on_foreign_package() {
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(
        NativeResourceRecord::new("sprite:merged", NativeResourceKind::Texture)
            .owned_by("runtime.diff")
            .require_packages(["base", "runtime.diff"])
            .memory(100, 300),
    );

    let plan = ledger.plan_package_unload("runtime.diff");
    assert!(!plan.can_unload());
    assert_eq!(plan.releasable.len(), 0);
    assert_eq!(plan.blocked.len(), 1);
    assert_eq!(
        plan.blocked[0].reason,
        PackageUnloadBlockerReason::OwnerStillRequiredByForeignPackage
    );
    assert!(ledger.release_package_owned("runtime.diff").is_empty());
}
