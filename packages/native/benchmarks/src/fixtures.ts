export interface NativeAuthoringBenchmarkFixtures {
  qss: string
  qui: string
}

export function createNativeAuthoringBenchmarkFixtures(): NativeAuthoringBenchmarkFixtures {
  return {
    qui: createQuiFixture(),
    qss: createQssFixture(),
  }
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

function createQssFixture(): string {
  const rules = Array.from({ length: 24 }, (_, index) => `
Panel.card${index} {
  background-color: #10141f;
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
