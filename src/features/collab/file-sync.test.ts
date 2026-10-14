import type { BinaryFiles } from "@excalidraw/excalidraw/types"
import { expect, test } from "vitest"
import { selectMissingFileIds, selectUploads } from "./file-sync"
import type { SceneElement } from "./protocol"

const image = (
  id: string,
  fileId: string | null,
  status?: string,
  extra: Partial<SceneElement> = {},
): SceneElement => ({
  id,
  version: 1,
  versionNonce: 1,
  type: "image",
  fileId,
  ...(status === undefined ? {} : { status }),
  ...extra,
})

const rectangle = (id: string): SceneElement => ({
  id,
  version: 1,
  versionNonce: 1,
  type: "rectangle",
})

const bytes = (...fileIds: string[]): BinaryFiles =>
  Object.fromEntries(
    fileIds.map((fileId) => [
      fileId,
      {
        id: fileId,
        mimeType: "image/png",
        dataURL: `data:${fileId}`,
        created: 0,
      },
    ]),
  ) as BinaryFiles

test("offers a pending image this tab holds bytes for", () => {
  expect(
    selectUploads(
      [image("a", "file-1", "pending")],
      bytes("file-1"),
      new Set(),
    ),
  ).toEqual([{ fileId: "file-1", dataUrl: "data:file-1" }])
})

test("skips ids already known to be stored", () => {
  // The whole reason images from the page loader don't get re-POSTed by
  // everyone who opens the link — restore() leaves them `pending` forever.
  expect(
    selectUploads(
      [image("a", "file-1", "pending")],
      bytes("file-1"),
      new Set(["file-1"]),
    ),
  ).toEqual([])
})

test("waits for the bytes when the element lands before its file", () => {
  expect(
    selectUploads([image("a", "file-1", "pending")], bytes(), new Set()),
  ).toEqual([])
})

test.each([["saved"], ["error"]])("skips an image already %s", (status) => {
  expect(
    selectUploads([image("a", "file-1", status)], bytes("file-1"), new Set()),
  ).toEqual([])
})

test("skips deleted images, non-images, and elements with no fileId", () => {
  const elements = [
    image("a", "file-1", "pending", { isDeleted: true }),
    image("b", null, "pending"),
    rectangle("c"),
  ]
  expect(selectUploads(elements, bytes("file-1"), new Set())).toEqual([])
})

test("offers one upload per file however many elements reference it", () => {
  const elements = [
    image("a", "file-1", "pending"),
    image("b", "file-1", "pending"),
  ]
  expect(selectUploads(elements, bytes("file-1"), new Set())).toHaveLength(1)
})

test("an image with no status at all counts as pending", () => {
  expect(
    selectUploads([image("a", "file-1")], bytes("file-1"), new Set()),
  ).toEqual([{ fileId: "file-1", dataUrl: "data:file-1" }])
})

test("fetches the ids of saved images this tab has no bytes for", () => {
  expect(
    selectMissingFileIds(
      [image("a", "file-1", "saved"), image("b", "file-2", "saved")],
      new Set(["file-2"]),
    ),
  ).toEqual(["file-1"])
})

test("never fetches an errored image — the peer half of the 2 MB cap", () => {
  expect(
    selectMissingFileIds([image("a", "file-1", "error")], new Set()),
  ).toEqual([])
})

test("never fetches a pending image, whose row isn't written yet", () => {
  expect(
    selectMissingFileIds([image("a", "file-1", "pending")], new Set()),
  ).toEqual([])
})

test("asks for each missing id once", () => {
  expect(
    selectMissingFileIds(
      [image("a", "file-1", "saved"), image("b", "file-1", "saved")],
      new Set(),
    ),
  ).toEqual(["file-1"])
})

test("ignores deleted images and non-images", () => {
  expect(
    selectMissingFileIds(
      [image("a", "file-1", "saved", { isDeleted: true }), rectangle("b")],
      new Set(),
    ),
  ).toEqual([])
})
