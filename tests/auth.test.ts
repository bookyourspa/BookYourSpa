/**
 * Authentication & RBAC unit tests: password hashing, session integrity,
 * permission matrix.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeFixture, Fixture } from "./helpers";

let fx: Fixture;
let auth: typeof import("../src/lib/auth");

beforeAll(async () => {
  fx = makeFixture();
  process.env.DATABASE_PATH = fx.dbPath;
  auth = await import("../src/lib/auth");
});

afterAll(() => fx?.cleanup());

describe("password hashing", () => {
  it("verifies correct password and rejects wrong one", () => {
    const hash = auth.hashPassword("S3cret!pass");
    expect(hash.startsWith("scrypt:")).toBe(true);
    expect(auth.verifyPassword("S3cret!pass", hash)).toBe(true);
    expect(auth.verifyPassword("wrong", hash)).toBe(false);
    expect(auth.verifyPassword("S3cret!pass", "garbage")).toBe(false);
  });

  it("produces unique salts per hash", () => {
    const a = auth.hashPassword("same");
    const b = auth.hashPassword("same");
    expect(a).not.toBe(b);
    expect(auth.verifyPassword("same", a)).toBe(true);
    expect(auth.verifyPassword("same", b)).toBe(true);
  });
});

describe("permission matrix", () => {
  const user = (role: any, admin_level: any = null) =>
    ({ id: 1, email: "x", role, admin_level, full_name: "X", status: "active", phone: null, supplier_id: 1 }) as any;

  it("customers cannot access admin or supplier powers", () => {
    const c = user("customer");
    expect(auth.can(c, "customer:book")).toBe(true);
    expect(auth.can(c, "admin:all")).toBe(false);
    expect(auth.can(c, "admin:suppliers")).toBe(false);
    expect(auth.can(c, "supplier:manage")).toBe(false);
  });

  it("suppliers can manage their catalog but not admin functions", () => {
    const s = user("supplier");
    expect(auth.can(s, "supplier:manage")).toBe(true);
    expect(auth.can(s, "admin:all")).toBe(false);
    expect(auth.can(s, "admin:finance")).toBe(false);
  });

  it("admin levels grant scoped permissions", () => {
    expect(auth.can(user("admin", "super"), "admin:all")).toBe(true);
    expect(auth.can(user("admin", "super"), "admin:finance")).toBe(true);
    expect(auth.can(user("admin", "finance"), "admin:finance")).toBe(true);
    expect(auth.can(user("admin", "finance"), "admin:suppliers")).toBe(false);
    expect(auth.can(user("admin", "content"), "admin:content")).toBe(true);
    expect(auth.can(user("admin", "content"), "admin:all")).toBe(false);
    expect(auth.can(user("admin", "support"), "admin:support")).toBe(true);
    expect(auth.can(user("admin", "operations"), "admin:suppliers")).toBe(true);
    expect(auth.can(user("admin", "operations"), "admin:finance")).toBe(false);
  });

  it("suspended and anonymous users have no permissions", () => {
    const suspended = { ...user("customer"), status: "suspended" };
    expect(auth.can(suspended, "customer:book")).toBe(false);
    expect(auth.can(null, "customer:book")).toBe(false);
  });
});
