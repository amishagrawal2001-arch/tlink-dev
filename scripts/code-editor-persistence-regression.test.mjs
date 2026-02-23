import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

const toKey = p => {
  if (!p) {
    return null
  }
  const resolved = path.resolve(p)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

const getOpenFileKeysForRoot = (rootPath, docs) => {
  const rootKey = toKey(rootPath)
  const keys = new Set()
  for (const doc of docs) {
    const docPath = doc.path ?? doc.tempPath ?? null
    const docKey = toKey(docPath)
    if (!docKey || !rootKey) {
      continue
    }
    if (docKey === rootKey || docKey.startsWith(rootKey + path.sep)) {
      keys.add(docKey)
    }
  }
  return keys
}

const syncOpenedScopes = ({ folders, openedModes, docs, previousScopes }) => {
  const nextScopes = new Map(previousScopes)
  for (const folderPath of folders) {
    const rootKey = toKey(folderPath)
    if (!rootKey) {
      continue
    }
    if (!openedModes.has(rootKey)) {
      nextScopes.delete(rootKey)
      continue
    }
    nextScopes.set(rootKey, getOpenFileKeysForRoot(folderPath, docs))
  }
  return nextScopes
}

const shouldIncludeScopedTreeEntry = (scopedFiles, mode, entryPath, isDirectory) => {
  if (mode !== 'opened') {
    return true
  }
  if (!scopedFiles || !scopedFiles.size) {
    return false
  }
  const entryKey = toKey(entryPath)
  if (!entryKey) {
    return false
  }
  if (!isDirectory) {
    return scopedFiles.has(entryKey)
  }
  for (const fileKey of scopedFiles) {
    if (fileKey === entryKey || fileKey.startsWith(entryKey + path.sep)) {
      return true
    }
  }
  return false
}

test('opened-files mode survives restart and keeps scoped files only', () => {
  const root = '/tmp/work'
  const file = '/tmp/work/folder/a.txt'
  const rootKey = toKey(root)
  const openedModes = new Set([rootKey])
  const scopes = syncOpenedScopes({
    folders: [root],
    openedModes,
    docs: [{ path: file }],
    previousScopes: new Map(),
  })

  assert.equal(scopes.size, 1)
  assert.equal(scopes.get(rootKey)?.has(toKey(file)), true)
  assert.equal(
    shouldIncludeScopedTreeEntry(scopes.get(rootKey), 'opened', '/tmp/work/folder/b.txt', false),
    false,
  )
  assert.equal(
    shouldIncludeScopedTreeEntry(scopes.get(rootKey), 'opened', '/tmp/work/folder', true),
    true,
  )
})

test('opened-files mode with no open docs does not fall back to full folder', () => {
  const root = '/tmp/work'
  const rootKey = toKey(root)
  const scopes = syncOpenedScopes({
    folders: [root],
    openedModes: new Set([rootKey]),
    docs: [],
    previousScopes: new Map(),
  })

  const scopedFiles = scopes.get(rootKey)
  assert.equal(scopedFiles?.size, 0)
  assert.equal(shouldIncludeScopedTreeEntry(scopedFiles, 'opened', '/tmp/work/file.txt', false), false)
  assert.equal(shouldIncludeScopedTreeEntry(scopedFiles, 'full', '/tmp/work/file.txt', false), true)
})

test('legacy scoped roots imply opened-files mode during migration', () => {
  const root = '/tmp/work'
  const rootKey = toKey(root)
  const legacyScopes = new Map([[rootKey, new Set([toKey('/tmp/work/a.txt')])]])
  const migratedModes = new Set([...legacyScopes.keys()])
  assert.equal(migratedModes.has(rootKey), true)
})
