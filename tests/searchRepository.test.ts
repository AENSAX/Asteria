import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { searchBrowserFilePage } from "../src/main/db/searchRepository.js";
import {
  setupTestDatabase,
  teardownTestDatabase,
} from "./helpers/testDb.js";

let db: Database.Database;

interface FileFixture {
  name: string;
  domain?: "pending" | "library";
  favorite?: boolean;
  deleted?: boolean;
  importedAt?: string;
}

function insertFile(fixture: FileFixture): number {
  const result = db
    .prepare(
      `INSERT INTO files (
        sha256, original_path, file_name, size_bytes,
        domain, is_favorite, deleted_at, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `sha-${fixture.name}`,
      `C:/in/${fixture.name}`,
      fixture.name,
      100,
      fixture.domain ?? "library",
      fixture.favorite ? 1 : 0,
      fixture.deleted ? "2026-01-01 00:00:00" : null,
      fixture.importedAt ?? "2026-01-01 00:00:00",
    );

  return Number(result.lastInsertRowid);
}

function insertTag(name: string, namespace = ""): number {
  const style = db
    .prepare("SELECT id FROM tag_styles WHERE is_default = 1")
    .get() as { id: number };
  const result = db
    .prepare("INSERT INTO tags (style_id, namespace, name) VALUES (?, ?, ?)")
    .run(style.id, namespace, name);

  return Number(result.lastInsertRowid);
}

function tagFile(fileId: number, tagId: number): void {
  db.prepare("INSERT INTO file_tags (file_id, tag_id) VALUES (?, ?)").run(
    fileId,
    tagId,
  );
}

function search(query: string, page = 1, pageSize = 100): string[] {
  return searchBrowserFilePage({
    query,
    page,
    pageSize,
    sortKey: "importedAt",
    sortDirection: "asc",
  }).files.map((file) => file.fileName);
}

beforeEach(() => {
  db = setupTestDatabase();
});

afterEach(() => {
  teardownTestDatabase();
});

describe("searchBrowserFilePage", () => {
  it("returns all non-deleted files for an empty query", () => {
    insertFile({ name: "a.png", importedAt: "2026-01-01 00:00:01" });
    insertFile({ name: "b.png", importedAt: "2026-01-01 00:00:02" });
    insertFile({ name: "trash.png", deleted: true });

    expect(search("")).toEqual(["a.png", "b.png"]);
  });

  it("matches files by tag", () => {
    const foo = insertTag("foo");
    const withFoo = insertFile({ name: "with-foo.png" });
    insertFile({ name: "without.png" });
    tagFile(withFoo, foo);

    expect(search("foo")).toEqual(["with-foo.png"]);
  });

  it("matches namespaced tags by full name", () => {
    const baz = insertTag("baz", "ns");
    const file = insertFile({ name: "ns.png" });
    tagFile(file, baz);

    expect(search("ns:baz")).toEqual(["ns.png"]);
    expect(search("baz")).toEqual(["ns.png"]);
  });

  it("combines NOT with AND correctly", () => {
    const foo = insertTag("foo");
    const bar = insertTag("bar");
    const both = insertFile({ name: "both.png" });
    const onlyBar = insertFile({ name: "only-bar.png" });
    const onlyFoo = insertFile({ name: "only-foo.png" });
    insertFile({ name: "none.png" });
    tagFile(both, foo);
    tagFile(both, bar);
    tagFile(onlyBar, bar);
    tagFile(onlyFoo, foo);

    // regression: SQLite INTERSECT binds tighter than EXCEPT, so an
    // unparenthesized compile of "-foo + bar" used to compute
    // universe EXCEPT (foo INTERSECT bar) instead of (NOT foo) AND bar
    expect(search("-foo + bar")).toEqual(["only-bar.png"]);
  });

  it("combines OR with a negated right operand correctly", () => {
    const foo = insertTag("foo");
    const bar = insertTag("bar");
    const onlyFoo = insertFile({ name: "only-foo.png" });
    const onlyBar = insertFile({ name: "only-bar.png" });
    insertFile({ name: "none.png" });
    tagFile(onlyFoo, foo);
    tagFile(onlyBar, bar);

    // foo OR (NOT bar) = everything except files tagged only with bar
    expect(search("foo / -bar").sort()).toEqual(["none.png", "only-foo.png"]);
  });

  it("treats double negation as identity within the universe", () => {
    const foo = insertTag("foo");
    const file = insertFile({ name: "foo.png" });
    insertFile({ name: "other.png" });
    tagFile(file, foo);

    expect(search("--foo")).toEqual(["foo.png"]);
  });

  it("supports grouped expressions", () => {
    const a = insertTag("a");
    const b = insertTag("b");
    const c = insertTag("c");
    const fileAC = insertFile({ name: "ac.png" });
    const fileBC = insertFile({ name: "bc.png" });
    const fileC = insertFile({ name: "c.png" });
    tagFile(fileAC, a);
    tagFile(fileAC, c);
    tagFile(fileBC, b);
    tagFile(fileBC, c);
    tagFile(fileC, c);

    expect(search("(a / b) c").sort()).toEqual(["ac.png", "bc.png"]);
    expect(search("-(a / b) c")).toEqual(["c.png"]);
  });

  it("matches parent tags through semantic inheritance", () => {
    const animal = insertTag("animal");
    const cat = insertTag("cat");
    db.prepare(
      "INSERT INTO tag_parents (parent_tag_id, child_tag_id) VALUES (?, ?)",
    ).run(animal, cat);
    const catFile = insertFile({ name: "cat.png" });
    tagFile(catFile, cat);

    expect(search("animal")).toEqual(["cat.png"]);
  });

  it("matches sibling aliases in both directions", () => {
    const canonical = insertTag("canonical");
    const alias = insertTag("alias");
    db.prepare(
      "INSERT INTO tag_siblings (canonical_tag_id, alias_tag_id) VALUES (?, ?)",
    ).run(canonical, alias);
    const aliasFile = insertFile({ name: "alias.png" });
    tagFile(aliasFile, alias);
    const canonicalFile = insertFile({ name: "canonical.png" });
    tagFile(canonicalFile, canonical);

    expect(search("canonical").sort()).toEqual(["alias.png", "canonical.png"]);
    expect(search("alias").sort()).toEqual(["alias.png", "canonical.png"]);
  });

  it("matches favorites and domain pseudo tags", () => {
    insertFile({ name: "fav.png", favorite: true });
    insertFile({ name: "pending.png", domain: "pending" });
    insertFile({ name: "plain.png" });

    expect(search("favorite")).toEqual(["fav.png"]);
    expect(search("喜欢")).toEqual(["fav.png"]);
    expect(search("domain:pending")).toEqual(["pending.png"]);
  });

  it("never returns trashed files", () => {
    const foo = insertTag("foo");
    const trashed = insertFile({ name: "trashed.png", deleted: true });
    tagFile(trashed, foo);

    expect(search("foo")).toEqual([]);
    expect(search("-foo")).toEqual([]);
  });

  it("paginates results and reports the total", () => {
    const foo = insertTag("foo");

    for (let index = 1; index <= 5; index += 1) {
      const file = insertFile({
        name: `f${index}.png`,
        importedAt: `2026-01-01 00:00:0${index}`,
      });
      tagFile(file, foo);
    }

    const firstPage = searchBrowserFilePage({
      query: "foo",
      page: 1,
      pageSize: 2,
      sortKey: "importedAt",
      sortDirection: "asc",
    });

    expect(firstPage.total).toBe(5);
    expect(firstPage.files.map((file) => file.fileName)).toEqual([
      "f1.png",
      "f2.png",
    ]);

    expect(search("foo", 3, 2)).toEqual(["f5.png"]);
    expect(search("foo", 4, 2)).toEqual([]);
  });

  it("returns an empty page for an unparsable query", () => {
    insertFile({ name: "a.png" });

    const result = searchBrowserFilePage({
      query: "()",
      page: 1,
      pageSize: 10,
      sortKey: "importedAt",
      sortDirection: "desc",
    });

    expect(result.total).toBe(0);
    expect(result.files).toEqual([]);
  });
});
