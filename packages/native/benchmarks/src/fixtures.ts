export interface NativeAuthoringBenchmarkFixtures {
  projectFiles: NativeAuthoringBenchmarkProjectFile[]
  qss: string
  qui: string
}

export interface NativeAuthoringBenchmarkProjectFile {
  filePath: string
  languageId: 'qua-style' | 'qua-ui'
  source: string
  uri: string
  version: number
}

export function createNativeAuthoringBenchmarkFixtures(): NativeAuthoringBenchmarkFixtures {
  const qui = createQuiFixture()
  const qss = createQssFixture()

  return {
    projectFiles: createProjectFiles(qui, qss),
    qss,
    qui,
  }
}

export function createUpdatedQuiProjectSource(source: string, iteration: number): string {
  return source.replace('"Open"', `"Open ${iteration}"`)
}

function createQuiFixture(): string {
  const panels = Array.from({ length: 24 }, (_, index) => `
    Panel.card${index}(if: view.sections[${index}].visible) {
      slot header {
        Row {
          Text { view.sections[${index}].title }
          Button(action: ui.open("section-${index}")) {
            Text { "Open" }
          }
        }
      }
      slot body {
        Column {
          RichText { view.sections[${index}].body }
          Image(src: assets.sections[${index}].poster)
          Button(
            for: (choice, choiceIndex) in view.sections[${index}].choices,
            key: choice.id,
            action: choice.select(choice.id)
          ) {
            Text { choice.label }
            Text { choiceIndex }
          }
          Text(if: view.sections[${index}].status == "ready") { "Ready" }
          Text(else-if: view.sections[${index}].status == "loading") { "Loading" }
          Text(else) { "Idle" }
        }
      }
      slot footer {
        Divider
      }
    }
  `).join('\n')

  return `
import style "./menu.qss";
import tokens "./theme.tokens.json";

Stack {
  SafeArea {
    Scroll {
      Column {
${panels}
      }
    }
  }
}
`.trimStart()
}

function createProjectFiles(qui: string, qss: string): NativeAuthoringBenchmarkProjectFile[] {
  return Array.from({ length: 6 }, (_, index) => [
    {
      filePath: `bench/project/menu-${index}.qui`,
      languageId: 'qua-ui' as const,
      source: qui.replace('./menu.qss', `./menu-${index}.qss`),
      uri: `file:///bench/project/menu-${index}.qui`,
      version: 1,
    },
    {
      filePath: `bench/project/menu-${index}.qss`,
      languageId: 'qua-style' as const,
      source: qss,
      uri: `file:///bench/project/menu-${index}.qss`,
      version: 1,
    },
  ]).flat()
}

function createQssFixture(): string {
  const rules = Array.from({ length: 24 }, (_, index) => `
Panel.card${index} {
  background-color: #10141f;
  background-image: asset("ui/card-${index}.png");
  border-color: #31415f;
  border-radius: ${6 + (index % 4)}px;
  border-width: 1px;
  opacity: ${index % 3 === 0 ? '0.94' : '1'};
}

Panel.card${index}::part(header), Button:hover {
  color: #f6f8ff;
  font-family: "Inter";
  font-size: ${18 + (index % 3)}px;
  font-weight: ${index % 2 === 0 ? '600' : '500'};
  line-height: 1.2;
  text-align: left;
}

Image[role="poster"] {
  object-fit: cover;
}
`).join('\n')

  return `
@tokens "./theme.tokens.json";
@media (orientation: landscape) {
  Panel {
    border-width: 1px;
  }
}

${rules}
`.trimStart()
}
