import { spawn } from "node:child_process"

export type ProcessRequest = {
  readonly cwd: string
  readonly command: string
  readonly args: ReadonlyArray<string>
}

export type ProcessResult = {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

const maxOutputBytes = 2 * 1024 * 1024

const bound = (text: string): string =>
  text.length > maxOutputBytes ? text.slice(0, maxOutputBytes) : text

export const runProcess = (request: ProcessRequest): Promise<ProcessResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(request.command, [...request.args], {
      cwd: request.cwd,
      env: process.env,
      shell: false,
    })

    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdout = bound(stdout + chunk)
    })
    child.stderr.on("data", (chunk: string) => {
      stderr = bound(stderr + chunk)
    })
    child.on("error", reject)
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      })
    })
  })
