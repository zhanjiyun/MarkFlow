(async () => {
  const {
    UNTITLED_NAME,
    getFileName,
    getNextUntitledName,
    isPlaceholderTab,
    selectNextActive,
    shouldReplacePlaceholder,
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

  test("Windows path -> filename", () => {
    assert(getFileName("C:\\Users\\me\\notes.md") === "notes.md");
  });
  test("Unix path -> filename", () => {
    assert(getFileName("/home/me/readme.markdown") === "readme.markdown");
  });
  test("empty path -> untitled", () => {
    assert(getFileName("") === UNTITLED_NAME);
  });
  test("chinese path", () => {
    assert(getFileName("D:\\文档\\测试.mdown") === "测试.mdown");
  });
  test("path with spaces", () => {
    assert(getFileName("C:\\My Files\\hello world.md") === "hello world.md");
  });

  test("no existing tabs -> untitled", () => {
    assert(getNextUntitledName([]) === UNTITLED_NAME);
  });
  test("one untitled -> untitled 2.md", () => {
    assert(getNextUntitledName([{ name: UNTITLED_NAME }]) === "未命名 2.md");
  });
  test("two untitleds -> untitled 3.md", () => {
    assert(getNextUntitledName([{ name: UNTITLED_NAME }, { name: "未命名 2.md" }]) === "未命名 3.md");
  });
  test("gap in numbering fills lowest", () => {
    assert(getNextUntitledName([{ name: UNTITLED_NAME }, { name: "未命名 3.md" }]) === "未命名 2.md");
  });
  test("real files do not affect naming", () => {
    assert(getNextUntitledName([{ name: "readme.md" }]) === UNTITLED_NAME);
  });

  test("empty untitled is placeholder", () => {
    assert(isPlaceholderTab({ path: null, content: "", saved: true, pinned: false }));
  });
  test("tab with content is NOT placeholder", () => {
    assert(!isPlaceholderTab({ path: null, content: "# Hi", saved: false, pinned: false }));
  });
  test("tab with path is NOT placeholder", () => {
    assert(!isPlaceholderTab({ path: "/f.md", content: "", saved: true, pinned: false }));
  });
  test("pinned tab is NOT placeholder", () => {
    assert(!isPlaceholderTab({ path: null, content: "", saved: true, pinned: true }));
  });
  test("whitespace-only content IS placeholder", () => {
    assert(isPlaceholderTab({ path: null, content: "  \n ", saved: true, pinned: false }));
  });

  test("single placeholder -> should replace", () => {
    assert(shouldReplacePlaceholder([{ path: null, content: "", saved: true, pinned: false }]));
  });
  test("single placeholder with whitespace -> should replace", () => {
    assert(shouldReplacePlaceholder([{ path: null, content: "  ", saved: true, pinned: false }]));
  });
  test("single tab with content -> should NOT replace", () => {
    assert(!shouldReplacePlaceholder([{ path: null, content: "# Doc", saved: false, pinned: false }]));
  });
  test("single tab with path -> should NOT replace", () => {
    assert(!shouldReplacePlaceholder([{ path: "/f.md", content: "", saved: true, pinned: false }]));
  });
  test("two tabs (one placeholder) -> should NOT replace", () => {
    assert(
      !shouldReplacePlaceholder([
        { path: null, content: "", saved: true, pinned: false },
        { path: "/a.md", content: "", saved: true, pinned: false },
      ])
    );
  });
  test("empty tabs array -> should NOT replace", () => {
    assert(!shouldReplacePlaceholder([]));
  });
  test("single pinned placeholder -> should NOT replace", () => {
    assert(!shouldReplacePlaceholder([{ path: null, content: "", saved: true, pinned: true }]));
  });

  test("close active -> fallback to next tab at same index", () => {
    const tabs = [
      { id: "a", name: "a.md" },
      { id: "b", name: "b.md" },
      { id: "c", name: "c.md" },
    ];
    assert(selectNextActive(tabs, ["b"], "b") === "c");
  });
  test("close last tab -> fallback to previous", () => {
    const tabs = [
      { id: "a", name: "a.md" },
      { id: "b", name: "b.md" },
    ];
    assert(selectNextActive(tabs, ["b"], "b") === "a");
  });
  test("close non-active tab -> keep current active", () => {
    const tabs = [
      { id: "a", name: "a.md" },
      { id: "b", name: "b.md" },
    ];
    assert(selectNextActive(tabs, ["b"], "a") === "a");
  });
  test("close all -> returns null", () => {
    const tabs = [{ id: "a", name: "a.md" }];
    assert(selectNextActive(tabs, ["a"], "a") === null);
  });
  test("active is null -> pick first remaining", () => {
    const tabs = [
      { id: "a", name: "a.md" },
      { id: "b", name: "b.md" },
    ];
    assert(selectNextActive(tabs, ["a"], null) === "b");
  });

  console.log("\n====================================");
  console.log("MarkFlow FileSystem Logic Tests");
  console.log(`Passed: ${pass}/${pass + fail}`);
  console.log(`Failed: ${fail}/${pass + fail}`);
  console.log("====================================\n");

  if (fail > 0) {
    for (const f of failures) console.log(`[FAIL] ${f.name}: ${f.error}`);
    process.exit(1);
  }
  console.log("All filesystem logic tests passed.\n");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
