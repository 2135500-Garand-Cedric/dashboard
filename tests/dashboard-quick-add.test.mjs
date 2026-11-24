import assert from "node:assert/strict";
import test from "node:test";
import { loadWorkModule } from "./helpers/work-support.mjs";
const { dashboardReturn, taskReturn } = loadWorkModule("src/lib/dashboard-quick-add.ts");

test("Quick add accepts only the exact dashboard return marker", () => {
  assert.equal(dashboardReturn("/"), "/");
  for (const value of [
    undefined,
    null,
    ["/"],
    "//evil.example",
    "https://evil.example",
    "/?x=1",
    "/#x",
    "/\\evil.example",
    "%2F",
    "/api/auth/signout",
    "/todos",
  ])
    assert.equal(dashboardReturn(value), undefined);
});
test("task returns preserve existing contexts and reject unsafe normalized destinations", () => {
  for (const value of [
    "/",
    "/todos",
    "/my-work?q=test",
    "/projects/12?stage=2",
    "/knowledge/3",
    "/events#calendar",
  ])
    assert.equal(taskReturn(value), value);
  for (const value of [
    null,
    "https://evil.example",
    "//evil.example",
    "/todos/../../api/auth/signout",
    "/todos/%2e%2e/api/auth/signout",
    "/todos\\evil",
    "/todos/%5cevil",
    "/todos%0a",
    "/todos/%ZZ",
    "/api/auth/signout",
    "/?returnTo=https://evil.example",
  ])
    assert.equal(taskReturn(value), "/todos");
});
