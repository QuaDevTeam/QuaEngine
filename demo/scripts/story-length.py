"""Count this demo's current QS prose and reachable routes; not a general QS parser.

Run from any directory with Python 3. Only CJK U+4E00–U+9FFF is counted.
Choice buttons, speaker labels, decorators, code and punctuation are excluded.
Unknown interpolation fails explicitly so it cannot silently inflate the count.
"""

import ast
import itertools
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src/game"
FILES = {p.stem: p.read_text() for p in (ROOT / "scenes").glob("*.qs")}
QUOTED = r"'(?:\\.|[^'\\])*'"
EXPRESSION = re.compile(
    r"\$\{scope\.(response|pick)\((" + QUOTED + r"(?:,\s*" + QUOTED + r")*)\)\}"
)


def cjk(text):
    return len(re.findall(r"[\u4e00-\u9fff]", text))


def prose(source, choices=None):
    source = re.sub(r"<script\b[^>]*>.*?</script>", "", source, flags=re.S)
    source = "\n".join(
        line for line in source.splitlines()
        if line.strip() and not line.lstrip().startswith("@")
    )
    # Actual dialogue uses ASCII colons. Full-width colons in signs/messages
    # remain part of authored prose, including their in-world labels.
    source = re.sub(r"^[^\n:${]{1,30}:\s*", "", source, flags=re.M)

    def resolve(match):
        args = ast.literal_eval("[" + match[2] + "]")
        if choices is None:
            return "".join(args if match[1] == "response" else args[1:])
        if match[1] == "response":
            return args[1 if "catalog-first" in choices else 0]
        return args[1 if args[0] in choices else 2]

    source = EXPRESSION.sub(resolve, source)
    if "${" in source:
        raise ValueError("Unsupported interpolation; update the audit before counting")
    return source


runtime = (ROOT / "story/prologue-state.ts").read_text()
groups = ast.literal_eval(
    "[" + re.search(r"const choiceGroups = \[(.*?)\n\]", runtime, re.S)[1] + "]"
)
declared_choices = [
    choice for source in FILES.values()
    for choice in re.findall(r"@Choice\([^\n]*?\bid:\s*'([^']+)'", source)
]
expected_choices = [choice for group in groups for choice in group]
assert sorted(declared_choices) == sorted(expected_choices), "QS choices and runtime groups disagree"
used_choices = {
    ast.literal_eval("[" + match[2] + "]")[0]
    for source in FILES.values() for match in EXPRESSION.finditer(source)
    if match[1] == "pick"
}
assert used_choices <= set(expected_choices), "Prose uses a retired or unknown choice"

common = [
    "prologue-arrival", "prologue-commission", "prologue-restoration",
    "prologue-return-line",
] + [f"chapter-{i:02}" for i in range(1, 6)]
continuation = ["chapter-05-inspection", "chapter-06", "chapter-07", "epilogue"]
# Route policy mirrors prologue-state.ts; review it whenever playback changes.
assert set(FILES) == set(common + continuation + ["ending-handoff"])
rows = []
for choices in itertools.product(*groups):
    handoff = "early-handoff" in choices
    # The sixth choice is never reached in the short ending.
    if handoff and choices[-1] != groups[-1][0]:
        continue
    route = common + (["ending-handoff"] if handoff else continuation)
    counts = {name: cjk(prose(FILES[name], choices)) for name in route}
    rows.append({
        "ending": "handoff" if handoff else "letter" if "formal-followup" in choices else "tomorrow",
        "counts": counts,
        "total": sum(counts.values()),
    })

report = {
    "sourceCjk": sum(cjk(source) for source in FILES.values()),
    "proseWithAllAlternativesCjk": sum(cjk(prose(source)) for source in FILES.values()),
    "routes": {},
    "sections": {},
}
for ending in ["tomorrow", "letter", "handoff"]:
    totals = [row["total"] for row in rows if row["ending"] == ending]
    report["routes"][ending] = {"combinations": len(totals), "min": min(totals), "max": max(totals)}
for name in common + continuation + ["ending-handoff"]:
    values = [row["counts"][name] for row in rows if name in row["counts"]]
    report["sections"][name] = {"min": min(values), "max": max(values)}
print(json.dumps(report, ensure_ascii=False, indent=2))
