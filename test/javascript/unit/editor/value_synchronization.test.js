import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"
import { $getRoot, defineExtension } from "lexical"
import Lexxy from "src/config/lexxy"
import LexxyExtension from "src/extensions/lexxy_extension"
import { createTestEditor, destroyTestEditor, selectFirstText } from "../helpers/editor_helper"

// A host update listener, registered when the editor is built and so before
// the one that synchronizes the value, that throws while `failing` is set.
let failing = false

class FailingListenerExtension extends LexxyExtension {
  get enabled() {
    return this.editorConfig.get("failingListener") === true
  }

  get lexicalExtension() {
    return defineExtension({
      name: "test/failing-listener",
      register: (editor) => editor.registerUpdateListener(() => {
        if (failing) throw new Error("a host listener failed")
      })
    })
  }
}

let editorElement, previousExtensions

beforeAll(() => {
  previousExtensions = Lexxy.global.get("extensions")
  Lexxy.configure({ global: { extensions: [ FailingListenerExtension ] }, failing: { failingListener: true } })
})

afterAll(() => {
  Lexxy.configure({ global: { extensions: previousExtensions } })
})

afterEach(async () => {
  failing = false
  await destroyTestEditor(editorElement)
})

describe("value synchronization", () => {
  test("an update that only moves the selection keeps the value", async () => {
    editorElement = await createTestEditor({ value: "<p>hello</p>" })
    selectFirstText(editorElement, 1)
    const value = editorElement.value

    const changes = []
    editorElement.addEventListener("lexxy:change", () => changes.push(editorElement.value))
    selectFirstText(editorElement, 4)

    expect(editorElement.value).toBe(value)
    expect(changes).toEqual([])
  })

  test("an update that changes a node changes the value", async () => {
    editorElement = await createTestEditor({ value: "<p>hello</p>" })
    selectFirstText(editorElement, 1)

    editorElement.editor.update(() => {
      $getRoot().getFirstDescendant().setTextContent("changed")
    }, { discrete: true })

    expect(editorElement.value).toContain("changed")
    expect(editorElement.toString()).toBe("changed")
  })

  test("a change committed while an earlier listener threw reaches the value at the next update, even one that only moves the selection", async () => {
    editorElement = await createTestEditor({ value: "<p>hello</p>", attributes: { preset: "failing" } })
    selectFirstText(editorElement, 1)
    expect(editorElement.value).toContain("hello")

    failing = true
    expect(() => {
      editorElement.editor.update(() => {
        $getRoot().getFirstDescendant().setTextContent("changed")
      }, { discrete: true })
    }).toThrow("a host listener failed")
    failing = false

    selectFirstText(editorElement, 2)

    expect(editorElement.value).toContain("changed")
    expect(editorElement.toString()).toBe("changed")
  })
})
