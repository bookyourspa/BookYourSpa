/**
 * Authentication & RBAC unit tests: password hashing, session integrity,
 * permission matrix.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { makeFixture, Fixture } from "./helpers";

let fx: Fixture;
let auth: typeof import("../src/lib/auth");

beforeAll(async () => {
  fx = makeFixture();
  process.env.DATABASE_PATH = fx.dbPath;
  auth = await import("../src/lib/auth");
});

afterAll(() => {
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_NAME;
  fx?.cleanup();
});

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

describe("signed session tokens", () => {
  const SECRET = "test-secret-0123456789abcdef";
  const hadSecret = process.env.SESSION_SECRET;

  beforeAll(() => { process.env.SESSION_SECRET = SECRET; });
  afterAll(() => {
    if (hadSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = hadSecret;
  });

  it("round-trips a valid token", () => {
    const exp = Date.now() + 3600_000;
    const token = auth.signSession(42, exp);
    expect(auth.verifySessionToken(token)).toEqual({ userId: 42, expMs: exp });
  });

  it("rejects a tampered user id (signature covers the payload)", () => {
    const token = auth.signSession(42, Date.now() + 3600_000);
    const [, exp, sig] = token.split(".");
    expect(auth.verifySessionToken(`99.${exp}.${sig}`)).toBeNull();
    expect(auth.verifySessionToken(`42.${Number(exp) + 1000}.${sig}`)).toBeNull();
  });

  it("rejects expired tokens", () => {
    expect(auth.verifySessionToken(auth.signSession(42, Date.now() - 1000))).toBeNull();
  });

  it("rejects tokens signed with a different secret", () => {
    const token = auth.signSession(42, Date.now() + 3600_000);
    process.env.SESSION_SECRET = "another-secret-9876543210";
    expect(auth.verifySessionToken(token)).toBeNull();
    process.env.SESSION_SECRET = SECRET;
  });

  it("returns null for legacy raw tokens and garbage", () => {
    expect(auth.verifySessionToken("a".repeat(64))).toBeNull();
    expect(auth.verifySessionToken("")).toBeNull();
    expect(auth.verifySessionToken("1.2.zz")).toBeNull();
  });
});

describe("admin bootstrap (ADMIN_EMAIL/ADMIN_PASSWORD)", () => {
  const clearEnv = () => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_NAME;
  };

  afterEach(clearEnv);

  it("is a no-op when env vars are unset", () => {
    clearEnv();
    const count = () => (fx.db.prepare("SELECT COUNT(*) AS n FROM users").get() as any).n;
    const n = count();
    auth.ensureAdminBootstrap();
    expect(count()).toBe(n);
  });

  it("creates a super admin with a verifiable password", () => {
    process.env.ADMIN_EMAIL = "portal@bootstrap.test";
    process.env.ADMIN_PASSWORD = "BYS154@bys";
    process.env.ADMIN_NAME = "Portal Admin";
    auth.ensureAdminBootstrap();

    const row: any = fx.db.prepare("SELECT * FROM users WHERE email = 'portal@bootstrap.test'").get();
    expect(row).toBeTruthy();
    expect(row.role).toBe("admin");
    expect(row.admin_level).toBe("super");
    expect(row.status).toBe("active");
    expect(row.full_name).toBe("Portal Admin");
    expect(auth.verifyPassword("BYS154@bys", row.password_hash)).toBe(true);
  });

  it("is idempotent and never demotes or re-hashes an existing super admin", () => {
    process.env.ADMIN_EMAIL = "portal@bootstrap.test";
    process.env.ADMIN_PASSWORD = "BYS154@bys";
    auth.ensureAdminBootstrap();
    const first: any = fx.db.prepare("SELECT * FROM users WHERE email = 'portal@bootstrap.test'").get();

    process.env.ADMIN_PASSWORD = "DifferentPass1";
    auth.ensureAdminBootstrap();
    const second: any = fx.db.prepare("SELECT * FROM users WHERE email = 'portal@bootstrap.test'").get();

    const n = (fx.db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'portal@bootstrap.test'").get() as any).n;
    expect(n).toBe(1);
    // Existing super admin untouched — env password change must NOT hijack it.
    expect(second.password_hash).toBe(first.password_hash);
    expect(auth.verifyPassword("BYS154@bys", second.password_hash)).toBe(true);
    expect(auth.verifyPassword("DifferentPass1", second.password_hash)).toBe(false);
  });

  it("promotes an existing non-admin account at that email and resets its password", () => {
    fx.db.prepare(
      "INSERT INTO users (email, password_hash, role, full_name) VALUES ('promote@bootstrap.test', ?, 'customer', 'Cust')"
    ).run(auth.hashPassword("OldPassword1"));

    process.env.ADMIN_EMAIL = "promote@bootstrap.test";
    process.env.ADMIN_PASSWORD = "NewAdminPass1";
    auth.ensureAdminBootstrap();

    const row: any = fx.db.prepare("SELECT * FROM users WHERE email = 'promote@bootstrap.test'").get();
    expect(row.role).toBe("admin");
    expect(row.admin_level).toBe("super");
    expect(auth.verifyPassword("NewAdminPass1", row.password_hash)).toBe(true);
    expect(auth.verifyPassword("OldPassword1", row.password_hash)).toBe(false);
  });

  it("refuses a too-short admin password", () => {
    process.env.ADMIN_EMAIL = "short@bootstrap.test";
    process.env.ADMIN_PASSWORD = "short";
    auth.ensureAdminBootstrap();
    const row = fx.db.prepare("SELECT id FROM users WHERE email = 'short@bootstrap.test'").get();
    expect(row).toBeUndefined();
  });
});
