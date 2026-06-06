import assert from "node:assert/strict";
import test from "node:test";

import { classifyUploadScale, shouldAutoAnalyzeUpload } from "./upload-routing.ts";

test("classifyUploadScale keeps small uploads on the direct path", () => {
  assert.equal(
    classifyUploadScale({ fileSizeBytes: 5 * 1024 * 1024, featureCountEstimate: 10_000 }),
    "small",
  );
  assert.equal(shouldAutoAnalyzeUpload({ fileSizeBytes: 5 * 1024 * 1024, featureCountEstimate: 10_000 }), false);
});

test("classifyUploadScale promotes medium uploads when size or feature count grows", () => {
  assert.equal(
    classifyUploadScale({ fileSizeBytes: 30 * 1024 * 1024, featureCountEstimate: 10_000 }),
    "medium",
  );
  assert.equal(
    classifyUploadScale({ fileSizeBytes: 5 * 1024 * 1024, featureCountEstimate: 150_000 }),
    "medium",
  );
  assert.equal(shouldAutoAnalyzeUpload({ fileSizeBytes: 30 * 1024 * 1024, featureCountEstimate: 10_000 }), true);
});

test("classifyUploadScale marks very large uploads as large", () => {
  assert.equal(
    classifyUploadScale({ fileSizeBytes: 500 * 1024 * 1024, featureCountEstimate: 10_000 }),
    "large",
  );
  assert.equal(
    classifyUploadScale({ fileSizeBytes: 5 * 1024 * 1024, featureCountEstimate: 2_000_000 }),
    "large",
  );
});
