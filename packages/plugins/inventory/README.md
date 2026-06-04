# @quajs/plugin-inventory

Programmatic inventory plugin for QuaEngine. It provides item/category definitions, profile-persistent item quantities, QuaScript decorators, and pipeline events.

The plugin intentionally ships no renderer UI and no renderer plugin entry. A future inventory UI should be built as a separate renderer/plugin layer over the projection.

## Installation

```ts
import { QuaEngine } from '@quajs/engine'
import { InventoryPlugin } from '@quajs/plugin-inventory'

const engine = new QuaEngine()
const inventory = new InventoryPlugin({
  profileId: 'default',
})

engine.use(inventory)
await engine.init()
```

If `@quajs/plugin-settings` is installed, the inventory plugin registers a developer settings scope for `defaultProfileId`. It does not register player UI settings.

## State Model

- Item and category definitions live in plugin runtime state.
- Player item quantities live in `QuaStore` profile snapshots using `@quajs/plugin-inventory:profile:<profileId>`.
- Profile inventory is independent from story save/load/rollback, matching gallery and achievement profile semantics.
- Runtime package unload removes definitions/categories owned by or dependent on the package but keeps profile records.
- Missing definitions are kept in profile data and appear in projections as `available: false`.

The active view plugin projection is intentionally lightweight. It only tracks enough metadata for revision/profile observation and does not keep item definitions, icon asset refs, or profile records in `QuaViewProjection.plugins`.

## Register Definitions

```ts
import {
  defineInventoryCategory,
  defineInventoryItem,
} from '@quajs/plugin-inventory'

await inventory.registerCategory(defineInventoryCategory({
  id: 'keys',
  title: 'Keys',
  order: 10,
}))

await inventory.registerItem(defineInventoryItem({
  id: 'old-key',
  title: 'Old Key',
  summary: 'A small brass key.',
  categoryId: 'keys',
  icon: { type: 'images', name: 'ui/items/old-key.png' },
  maxQuantity: 1,
  consumable: false,
}))
```

Runtime package provenance is inherited when definitions are registered during package activation. You can also provide `contentPackageId` and `requiredRuntimePackages` explicitly.

## Mutate Profile Items

```ts
await inventory.grantItem('old-key')
await inventory.grantItem('coin', 3, { source: 'quest:opening' })
await inventory.consumeItem('coin', 1)
await inventory.setItemQuantity('potion', 2)

const hasKey = inventory.hasItem('old-key')
const coins = inventory.getItemQuantity('coin')
```

Mutation rules:

- quantities must be non-negative safe integers;
- grant/consume/set require a registered item definition;
- `maxQuantity` overflow throws;
- consuming more than the current quantity throws;
- `inventory.clearItem()` and `inventory.resetProfile()` may remove records whose definitions are no longer present.

## Read Projections

```ts
const profile = inventory.getProfile()
const projection = inventory.getProjection()
```

`InventoryProjection` contains category projections, registered definitions, available item records, and missing item records. It is derived from runtime definitions plus the selected profile snapshot.

## QuaScript Decorators

The package publishes package-local decorator metadata and lowering through `@quajs/plugin-inventory/script-compiler`.

```qs
@GrantInventoryItem('old-key')
Narrator: You found an old key.

@ConsumeInventoryItem('old-key')
Narrator: The lock turns.

@SetInventoryItemQuantity('coin', 0)
Narrator: Your purse is empty.
```

Decorator mappings:

| Decorator                                               | Runtime helper                       |
| ------------------------------------------------------- | ------------------------------------ |
| `@GrantInventoryItem(itemId, options?)`                 | `grantInventoryItemWithEngine`       |
| `@ConsumeInventoryItem(itemId, options?)`               | `consumeInventoryItemWithEngine`     |
| `@SetInventoryItemQuantity(itemId, quantity, options?)` | `setInventoryItemQuantityWithEngine` |

## Pipeline Events

Inventory emits logic-side pipeline events only:

- `inventory/item_changed`
- `inventory/profile_reset`

Use the contract helpers when subscribing:

```ts
import {
  InventoryLogicEvents,
  onInventoryLogic,
} from '@quajs/plugin-inventory/contracts'

const dispose = onInventoryLogic(
  engine.getPipeline(),
  InventoryLogicEvents.ITEM_CHANGED,
  async (payload) => {
    console.log(payload.itemId, payload.previousQuantity, payload.quantity)
  },
)
```

There are no render-to-logic inventory events in this package.
