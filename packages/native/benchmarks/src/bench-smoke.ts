import process from 'node:process'
import {
  assertNativeBenchmarkSmokeThresholds,
  runNativeAuthoringSmokeBenchmarks,
} from './index'

const records = runNativeAuthoringSmokeBenchmarks()
for (const record of records)
  process.stdout.write(`${JSON.stringify(record)}\n`)

const failures = assertNativeBenchmarkSmokeThresholds(records)
if (failures.length > 0) {
  for (const failure of failures)
    process.stderr.write(`${failure}\n`)
  process.exitCode = 1
}
