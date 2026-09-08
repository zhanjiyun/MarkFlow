(async () => {
  const {
    UNTITLED_NAME,
    filterRecoveredUntitledDocs,
    getNextUntitledName,
    isPlaceholderTab,
  } = await import("../src/hooks/fileSystemLogic.ts");

  let pass = 0;
  let fail = 0;
  const failures = [];

  function test(name, fn) {
    try {
      fn();
      pass++;
    } catch (e) {
      fail++;
      failures.push({ name, error: e.message });
    }
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg || "assertion failed");
  }

  test("empty untitled tab is a placeholder", () => {
    assert(isPlaceholderTab({ path: null, content: "", saved: true, pinned: false }));
  });

  test("tab with content is NOT a placeholder", () => {
    assert(!isPlaceholderTab({ path: null, content: "# Hello", saved: false, pinned: false }));
  });

  test("tab with path is NOT a placeholder", () => {
    assert(!isPlaceholderTab({ path: "/f.md", content: "", saved: true, pinned: false }));
  });

  test("unsaved tab is NOT a placeholder", () => {
    assert(!isPlaceholderTab({ path: null, content: "", saved: false, pinned: false }));
  });

  test("pinned tab is NOT a placeholder", () => {
    assert(!isPlaceholderTab({ path: null, content: "", saved: true, pinned: true }));
  });

  test("whitespace-only content is still a placeholder", () => {
    assert(isPlaceholderTab({ path: null, content: "  \n  ", saved: true, pinned: false }));
  });

  test(`no existing tabs -> ${UNTITLED_NAME}`, () => {
    assert(getNextUntitledName([]) === UNTITLED_NAME);
  });

  test(`existing ${UNTITLED_NAME} -> 未命名 2.md`, () => {
    assert(getNextUntitledName([{ name: UNTITLED_NAME }]) === "未命名 2.md");
  });

  test("existing untitled sequence -> next untitled number", () => {
    assert(
      getNextUntitledName([{ name: UNTITLED_NAME }, { name: "未命名 2.md" }]) === "未命名 3.md"
    );
  });

  test("existing real files do not affect untitled naming", () => {
    assert(getNextUntitledName([{ name: "readme.md" }, { name: "notes.md" }]) === UNTITLED_NAME);
  });

  test("gaps in numbering fill the lowest missing untitled number", () => {
    assert(getNextUntitledName([{ name: UNTITLED_NAME }, { name: "未命名 3.md" }]) === "未命名 2.md");
  });

  test("recovered docs with duplicate ids are filtered out", () => {
    const recovered = [
      { id: "a", name: UNTITLED_NAME },
      { id: "b", name: "未命名 2.md" },
    ];
    const existing = [{ id: "b", name: "existing.md" }];
    const filtered = filterRecoveredUntitledDocs(recovered, existing);
    assert(filtered.length === 1 && filtered[0].id === "a");
  });

  console.log("\n====================================");
  console.log("MarkFlow Untitled Recovery Tests");
  console.log(`Passed: ${pass}/${pass + fail}`);
  console.log(`Failed: ${fail}/${pass + fail}`);
  console.log("====================================\n");

  if (fail > 0) {
    for (const f of failures) {
      console.log(`[FAIL] ${f.name}: ${f.error}`);
    }
    process.exit(1);
  }

  console.log("All untitled recovery tests passed.\n");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
