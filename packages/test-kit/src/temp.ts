import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

export const withTempDir = async <A>(use: (root: string) => Promise<A>): Promise<A> => {
  const root = await mkdtemp(join(tmpdir(), "effectgrade-"))
  try {
    return await use(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
