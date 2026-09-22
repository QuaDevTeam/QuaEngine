// SPDX-License-Identifier: MPL-2.0

/** Plain logs are append-only, not a terminal. Keep one decoder per process pipe. */
export class ProcessLogDecoder {
  private state: 'text' | 'escape' | 'intermediate' | 'csi' | 'osc' | 'string' | 'string-escape' = 'text'
  private stringState: 'osc' | 'string' = 'string'
  private carriageReturn = false

  append(chunk: string): string {
    let text = ''
    for (const character of chunk) {
      const code = character.charCodeAt(0)
      if (this.state === 'osc' || this.state === 'string' || this.state === 'string-escape') {
        if (code === 0x9C || (this.state === 'osc' && code === 7) || (this.state === 'string-escape' && character === '\\')) {
          this.state = 'text'
        }
        else if (code === 0x1B) {
          if (this.state !== 'string-escape')
            this.stringState = this.state
          this.state = 'string-escape'
        }
        else if (this.state === 'string-escape') {
          this.state = this.stringState
        }
        continue
      }
      if (code === 0x1B) {
        this.state = 'escape'
        continue
      }
      if (this.state === 'escape') {
        if (character === '[')
          this.state = 'csi'
        else if (character === ']')
          this.state = 'osc'
        else if (['P', 'X', '^', '_'].includes(character))
          this.state = 'string'
        else if (code >= 0x20 && code <= 0x2F)
          this.state = 'intermediate'
        else
          this.state = 'text'
        continue
      }
      if (this.state === 'csi' || this.state === 'intermediate') {
        if (code >= 0x20 && code <= 0x7E) {
          if (code >= (this.state === 'csi' ? 0x40 : 0x30))
            this.state = 'text'
          continue
        }
        // A malformed sequence must not swallow the next line of diagnostics.
        this.state = 'text'
      }
      if (code === 0x9B) {
        this.state = 'csi'
        continue
      }
      if (code === 0x9D || [0x90, 0x98, 0x9E, 0x9F].includes(code)) {
        this.state = code === 0x9D ? 'osc' : 'string'
        continue
      }
      if (character === '\r') {
        text += '\n'
        this.carriageReturn = true
      }
      else if (character === '\n') {
        if (!this.carriageReturn)
          text += '\n'
        this.carriageReturn = false
      }
      else if (character === '\t' || (code >= 0x20 && !(code >= 0x7F && code <= 0x9F))) {
        this.carriageReturn = false
        text += character
      }
    }
    return text
  }
}
