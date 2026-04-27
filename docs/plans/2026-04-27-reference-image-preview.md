# Reference Image Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add click-to-enlarge preview for selected reference images in the composer.

**Architecture:** Keep preview state local to `ChatComposer`. Convert `selectedReferenceImages` into `yet-another-react-lightbox` slides and open the lightbox from an accessible button around each reference thumbnail/text area. Use the existing `Zoom` plugin and labels/styles consistent with other image previews.

**Tech Stack:** Next.js 16 client components, React 19, TypeScript, Vitest, Testing Library, `yet-another-react-lightbox`, pnpm.

---

### Task 1: Add failing preview tests

**Files:**
- Modify: `/Users/briver/Documents/code/my-products/1024token/image-chat/components/chat/chat-composer.test.tsx`

**Step 1: Mock Lightbox**

Add a hoisted state object and mock for `yet-another-react-lightbox` that records props and renders `<div data-testid="reference-lightbox">` when `props.open` is true.

**Step 2: Write failing test for opening preview**

Render `ChatComposer` with two reference images. Click `screen.getByRole("button", { name: "预览参考图 2" })`. Assert:

```ts
expect(screen.getByTestId("reference-lightbox")).toBeInTheDocument();
expect(lightboxState.lastProps?.index).toBe(1);
expect(lightboxState.lastProps?.slides).toEqual([
  { src: "data:image/png;base64,cmVmMQ==", alt: "夜色里的机械猫", width: 1024, height: 1024 },
  { src: "data:image/webp;base64,cmVmMg==", alt: "雨夜玻璃橱窗", width: 1536, height: 1024 },
]);
```

**Step 3: Write failing test for remove isolation**

Click `移除参考图 1` and assert the remove callback was called and `reference-lightbox` is not rendered.

**Step 4: Run focused tests to verify failure**

Run:

```bash
pnpm test:run components/chat/chat-composer.test.tsx
```

Expected: FAIL because reference image preview has not been implemented.

### Task 2: Implement composer lightbox preview

**Files:**
- Modify: `/Users/briver/Documents/code/my-products/1024token/image-chat/components/chat/chat-composer.tsx`
- Test: `/Users/briver/Documents/code/my-products/1024token/image-chat/components/chat/chat-composer.test.tsx`

**Step 1: Add imports**

Import `Maximize2Icon`, `Lightbox`, and `Zoom`.

**Step 2: Add state and slides**

Add `const [previewIndex, setPreviewIndex] = useState(-1);` and derive slides from `selectedReferenceImages`.

**Step 3: Make reference card previewable**

Wrap the non-remove card content in a button with `aria-label={`预览参考图 ${index + 1}`}` and `onClick={() => setPreviewIndex(index)}`. Keep the remove button separate.

**Step 4: Render Lightbox**

Render `Lightbox` with `open={previewIndex >= 0}`, `close={() => setPreviewIndex(-1)}`, `index={previewIndex >= 0 ? previewIndex : 0}`, `plugins={[Zoom]}`, slides, Chinese labels, and close rendering consistent with existing components.

**Step 5: Run focused tests**

Run:

```bash
pnpm test:run components/chat/chat-composer.test.tsx
```

Expected: PASS.

### Task 3: Verify project health

**Files:**
- No source changes expected.

**Step 1: Run lint**

```bash
pnpm lint
```

Expected: no errors.

**Step 2: Run all tests**

```bash
pnpm test:run
```

Expected: all tests pass.

### Task 4: Commit changes

**Files:**
- `/Users/briver/Documents/code/my-products/1024token/image-chat/docs/plans/2026-04-27-reference-image-preview-design.md`
- `/Users/briver/Documents/code/my-products/1024token/image-chat/docs/plans/2026-04-27-reference-image-preview.md`
- `/Users/briver/Documents/code/my-products/1024token/image-chat/components/chat/chat-composer.tsx`
- `/Users/briver/Documents/code/my-products/1024token/image-chat/components/chat/chat-composer.test.tsx`

**Step 1: Inspect diff**

```bash
git diff --stat && git diff -- components/chat/chat-composer.tsx components/chat/chat-composer.test.tsx
```

**Step 2: Commit**

```bash
git add docs/plans/2026-04-27-reference-image-preview-design.md docs/plans/2026-04-27-reference-image-preview.md components/chat/chat-composer.tsx components/chat/chat-composer.test.tsx
git commit -m "feat: preview composer reference images"
```
