import { FileSystemError, type FileSystemApi, type RepoPath } from "@effectgrade/domain"

export const withWriteFaults = (fs: FileSystemApi, failOnNth: number): FileSystemApi => {
  let writes = 0
  return {
    ...fs,
    writeFile: (path: RepoPath, contents: string) => {
      writes += 1
      if (writes === failOnNth) {
        return new FileSystemError({
          reason: "io",
          detail: `injected write failure on attempt ${String(failOnNth)}`,
          path,
        })
      }
      return fs.writeFile(path, contents)
    },
  }
}
