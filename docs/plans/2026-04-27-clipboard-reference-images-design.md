# Clipboard Reference Images Design

## Goal

Allow users to paste an image into the image-chat prompt input with the normal paste shortcut and use that pasted image as a reference image for the next generation.

## Context

The composer already supports reference images through file upload and through generated images. The shared ingestion path is `useImageChat.addReferenceImageFiles(files)`, which validates supported MIME types, enforces `MAX_REFERENCE_IMAGES`, reads dimensions, creates preview URLs, and displays toasts.

## Approved Interaction

- When the prompt textarea receives a paste event containing one or more image files, the app appends those images to the reference image list.
- The image paste event is prevented so the browser does not insert non-text clipboard content into the textarea.
- When the paste event contains no images, the textarea keeps the browser default behavior so text paste works normally.
- Existing reference image validation, limits, preview, removal, clearing, and submit behavior remain unchanged.

## Architecture

`ChatComposer` remains the only UI component changed. It reads `event.clipboardData.items`, extracts `File` entries with an image MIME type, and forwards them to the existing `onUploadReferenceImages` callback. The hook and backend request flow do not need new APIs because pasted images can be represented as ordinary `File` objects.

## Error Handling

The composer only detects pasted files. Unsupported formats, image count overflow, unreadable dimensions, and user feedback continue to be handled by `addReferenceImageFiles` in `useImageChat`.

## Testing

Add component tests for `ChatComposer`:

1. Pasting image clipboard items calls `onUploadReferenceImages` with those files and prevents the default paste.
2. Pasting text-only clipboard content does not call `onUploadReferenceImages` and leaves the default paste behavior available.
