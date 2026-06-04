---
name: quajs-plugin-inventory
description: Use, document, or modify @quajs/plugin-inventory. Covers inventory categories/items, profile item quantities, mutation rules, projections, QuaScript inventory decorators, pipeline events, settings, runtime package provenance, and validation.
---

# @quajs/plugin-inventory

Use this skill for `packages/plugins/inventory`, inventory item/category definitions, profile item quantities, inventory projections, pipeline events, or inventory QuaScript decorators.

## Responsibility

`@quajs/plugin-inventory` provides programmatic item/category definitions, profile-persistent item quantities, pipeline events, and QuaScript decorators. It intentionally ships no renderer UI and no renderer plugin entry.

Profile inventory is independent from story save/load and rollback.

## Setup

```ts
import { QuaEngine } from '@quajs/engine'
import { InventoryPlugin } from '@quajs/plugin-inventory'

const engine = new QuaEngine()
const inventory = new InventoryPlugin({ profileId: 'default' })

engine.use(inventory)
await engine.init()
```

When `@quajs/plugin-settings` is installed, inventory registers a developer settings scope for `defaultProfileId`; it does not register player UI settings.

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

Runtime package provenance is inherited during package activation. You can also provide `contentPackageId` and `requiredRuntimePackages` explicitly.

## Mutate Profile Items

```ts
await inventory.grantItem('old-key')
await inventory.grantItem('coin', 3, { source: 'quest:opening' })
await inventory.consumeItem('coin', 1)
await inventory.setItemQuantity('potion', 2)

const hasKey = inventory.hasItem('old-key')
const coins = inventory.getItemQuantity('coin')
```

Rules:

- quantities must be non-negative safe integers;
- grant/consume/set require a registered item definition;
- `maxQuantity` overflow throws;
- consuming more than current quantity throws;
- missing definitions may remain in profile data and appear as unavailable in projections.

## QuaScript Decorators

The package exports mappings and compiler lowering from `@quajs/plugin-inventory/script-compiler`.

```qs
@GrantInventoryItem('old-key')
Narrator: You found an old key.

@ConsumeInventoryItem('old-key')
Narrator: The lock turns.

@SetInventoryItemQuantity('coin', 0)
Narrator: Your purse is empty.
```

Decorators:

- `@GrantInventoryItem(itemId, options?)`
- `@ConsumeInventoryItem(itemId, options?)`
- `@SetInventoryItemQuantity(itemId, quantity, options?)`

## Pipeline Events

Inventory emits logic-side pipeline events only:

- `inventory/item_changed`
- `inventory/profile_reset`

Use contract helpers from `@quajs/plugin-inventory/contracts`. There are no render-to-logic inventory events in this package.

## Runtime Packages

Runtime package unload removes definitions/categories owned by or dependent on the package but keeps profile records.

## Validation

```bash
pnpm --filter @quajs/plugin-inventory test -- --run
pnpm --filter @quajs/plugin-inventory typecheck
pnpm --filter @quajs/plugin-inventory build
```

## Review Checklist

- Are definitions separate from profile quantities?
- Does save/load avoid restoring profile inventory state?
- Are mutation rules enforced?
- Are runtime package definitions removed without deleting profile records?
- If inventory API, decorator, projection, or events changed, was this skill updated?
