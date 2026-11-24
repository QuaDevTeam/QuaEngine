import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

function processes() {
  const output = execFileSync('ps', ['-axo', 'pid=,ppid=,pgid=,stat=,lstart='], { encoding: 'utf8', timeout: 3000, maxBuffer: 8 * 1024 * 1024 })
  return output.trim().split('\n').map((line) => {
    const [pid, parent, group, state, ...started] = line.trim().split(/\s+/u)
    return { pid: Number(pid), parent: Number(parent), group: Number(group), state, started: started.join(' ') }
  })
}

function signal(pid, name) {
  try {
    process.kill(pid, name)
  }
  catch (error) {
    if (error.code !== 'ESRCH')
      throw error
  }
}

/** Stop only this scenario, including detached Electron and preview descendants. */
export async function stopScenarioTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return
  if (process.platform === 'win32') {
    execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { timeout: 10000, stdio: 'pipe' })
    return
  }

  // Snapshot before TERM: once a launcher exits, surviving descendants can be
  // reparented to init. Match PID and start time before reusing a recorded PID.
  const identities = new Map()
  const groups = new Set()
  function collect(rows) {
    const members = new Set()
    const liveGroups = new Set()
    for (const row of rows) {
      if (identities.get(row.pid) === row.started) {
        members.add(row.pid)
        if (groups.has(row.group))
          liveGroups.add(row.group)
      }
    }
    let size
    do {
      size = members.size
      for (const row of rows) {
        if (members.has(row.parent) || liveGroups.has(row.group))
          members.add(row.pid)
      }
    } while (size !== members.size)
    return rows.filter((row) => {
      if (!members.has(row.pid))
        return false
      identities.set(row.pid, row.started)
      if (row.group === row.pid)
        groups.add(row.group)
      return !row.state.startsWith('Z')
    })
  }
  const rows = processes()
  const root = rows.find(row => row.pid === child.pid)
  if (!root)
    return
  identities.set(root.pid, root.started)
  collect(rows)
  child.kill('SIGTERM')
  const deadline = Date.now() + 5000
  // Give Playwright its graceful close window, even if the scenario already exited.
  let live
  do {
    await delay(200)
    live = collect(processes())
    if (!live.length)
      return
  } while (Date.now() < deadline)

  // An owned process group can outlive its leader. Signal only groups created
  // inside the subtree with a verified live member, and remaining individual PIDs.
  for (const group of new Set(live.map(row => row.group).filter(group => groups.has(group))))
    signal(-group, 'SIGKILL')
  for (const row of live.filter(row => !groups.has(row.group)))
    signal(row.pid, 'SIGKILL')

  const killed = Date.now() + 3000
  do {
    await delay(100)
    live = collect(processes())
    if (!live.length)
      return
  } while (Date.now() < killed)
  throw new Error(`Scenario processes survived termination: ${live.map(row => row.pid).join(', ')}`)
}
