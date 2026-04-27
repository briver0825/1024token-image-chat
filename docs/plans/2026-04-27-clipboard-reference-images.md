# Clipboard Reference Images Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add prompt-input paste support so clipboard images become reference images.

**Architecture:** Keep the feature inside the existing client-side `ChatComposer`. Extract image `File` objects from the textarea paste event and reuse the existing `onUploadReferenceImages` callback, leaving validation and limits in `useImageChat.addReferenceImageFiles`.

**Tech Stack:** Next.js 16 client components, React 19, TypeScript, Vitest, Testing Library, pnpm.

---

### Task 1: Add paste behavior tests

**Files:**
- Modify: `/Users/briver/Documents/code/my-products/1024token/image-chat/components/chat/chat-composer.test.tsx`

**Step 1: Write the failing image paste test**

Add a test that renders `ChatComposer` with `onUploadReferenceImages`, dispatches a `paste` event on the textarea with `clipboardData.items` containing a PNG `File`, and asserts:

```ts
expect(onUploadReferenceImages).toHaveBeenCalledWith([imageFile]);
expect(pasteEvent.defaultPrevented).toBe(true);
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:run components/chat/chat-composer.test.tsx
```

Expected: FAIL because `ChatComposer` does not handle paste images yet.

**Step 3: Write the text-only paste test**

Add a test that dispatches a `paste` event with only text clipboard data and asserts `onUploadReferenceImages` is not called and the default event is not prevented.

### Task 2: Implement minimal paste handler

**Files:**
- Modify: `/Users/briver/Documents/code/my-products/1024token/image-chat/components/chat/chat-composer.tsx`
- Test: `/Users/briver/Documents/code/my-products/1024token/image-chat/components/chat/chat-composer.test.tsx`

**Step 1: Add helper logic in `ChatComposer`**

Add a local paste handler that:

```ts
function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
  if (!onUploadReferenceImages) {
    return;
  }

  const pastedImageFiles = Array.from(event.clipboardData.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));

  if (pastedImageFiles.length === 0) {
    return;
  }

  event.preventDefault();
  void onUploadReferenceImages(pastedImageFiles);
}
```

Then pass it to the textarea as `onPaste={handlePaste}`.

**Step 2: Run focused tests**

Run:

```bash
pnpm test:run components/chat/chat-composer.test.tsx
```

Expected: PASS.

### Task 3: Verify project health

**Files:**
- No source changes expected.

**Step 1: Run lint**

Run:

```bash
pnpm lint
```

Expected: no errors.

**Step 2: Run full tests**

Run:

```bash
pnpm test:run
```

Expected: all tests pass.

### Task 4: Commit changes

**Files:**
- `/Users/briver/Documents/code/my-products/1024token/image-chat/docs/plans/2026-04-27-clipboard-reference-images-design.md`
- `/Users/briver/Documents/code/my-products/1024token/image-chat/docs/plans/2026-04-27-clipboard-reference-images.md`
- `/Users/briver/Documents/code/my-products/1024token/image-chat/components/chat/chat-composer.test.tsx`
- `/Users/briver/Documents/code/my-products/1024token/image-chat/components/chat/chat-composer.tsx`

**Step 1: Inspect diff**

Run:

```bash
git diff --stat && git diff -- components/chat/chat-composer.tsx components/chat/chat-composer.test.tsx
```

**Step 2: Commit**

Run:

```bash
git add docs/plans/2026-04-27-clipboard-reference-images-design.md docs/plans/2026-04-27-clipboard-reference-images.md components/chat/chat-composer.tsx components/chat/chat-composer.test.tsx
git commit -m "feat: support pasting reference images"
```
