export type CommandResult = {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export const expectExitCode = (result: CommandResult, expected: number): void => {
  if (result.exitCode !== expected) {
    const detail = [result.stdout, result.stderr].filter((part) => part.length > 0).join("\n")
    throw new Error(
      `expected exit code ${String(expected)}, received ${String(result.exitCode)}${detail.length > 0 ? `\n${detail}` : ""}`,
    )
  }
}
