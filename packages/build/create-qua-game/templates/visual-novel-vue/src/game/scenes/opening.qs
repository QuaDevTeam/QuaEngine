<script lang="ts">
export interface Scope {
  playerName: string
}
</script>

<script setup lang="ts">
const playerName = scope.playerName
</script>

@SetBackground('backgrounds/classroom.svg', { transition: { type: 'fade', duration: 500 } })
@ShowCharacter('Alice', { sprite: 'alice/base.svg', position: { x: 960, y: 640 }, layer: 1 })
Alice: Welcome to __PROJECT_TITLE__, ${playerName}.

Alice: This scene is a real QuaScript module. The renderer is only projecting engine-owned state.

- Open the settings panel -> settings
- Keep reading -> continue

Alice: The toolbar above can open Settings and Backlog through pipeline-backed intent events.

Alice: Replace this file with your first scene, then add art and audio under the assets folder.
