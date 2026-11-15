/** Owners manage categories in the console; the app lists them in the chosen order. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { V1, app, cleanupUsers, pool, request, staffSession, type StaffSession } from "./helpers.js";

const PREFIX = "+2567999";
const TAG = `TEST cat ${Date.now()}`;
let owner: StaffSession;
let staff: StaffSession;
let originalOrder: number[];

const create = (name: string, icon?: string | null) =>
  request(app).post(`${V1}/admin/categories`).set(owner.h).send({ name, icon });
const adminList = async () => (await request(app).get(`${V1}/admin/categories`).set(owner.h).expect(200)).body as Array<{
  id: number; name: string; icon: string | null; productCount: number;
}>;

beforeAll(async () => {
  owner = await staffSession(PREFIX, "owner");
  staff = await staffSession(PREFIX, "staff");
  originalOrder = (await adminList()).map((c) => c.id);
});

afterAll(async () => {
  await pool.query("delete from products where name like $1", [`${TAG}%`]);
  await pool.query("delete from categories where name like $1", [`${TAG}%`]);
  // Put the real categories back in their original order.
  for (let i = 0; i < originalOrder.length; i++) {
    await pool.query("update categories set sort_order = $1 where id = $2", [i + 1, originalOrder[i]]);
  }
  await cleanupUsers(PREFIX);
  await pool.end();
});

describe("categories", () => {
  it("owners add a category with an emoji; it goes to the end of the app's list", async () => {
    const res = await create(`${TAG} Fruits`, "🍎");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: `${TAG} Fruits`, icon: "🍎" });
    const app_ = (await request(app).get(`${V1}/categories`).expect(200)).body as Array<{ id: number }>;
    expect(app_.at(-1)!.id).toBe(res.body.id);
  });

  it("refuses duplicate names, ignoring letter case", async () => {
    await create(`${TAG} Spices`).expect(201);
    const dup = await create(`${TAG} SPICES`);
    expect(dup.status).toBe(409);
    expect(dup.body.message).toMatch(/already a category/);
  });

  it("renames and changes or clears the icon", async () => {
    const c = (await create(`${TAG} Drinks`, "🧃")).body;
    const renamed = await request(app).patch(`${V1}/admin/categories/${c.id}`).set(owner.h).send({ name: `${TAG} Beverages`, icon: "☕" });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: `${TAG} Beverages`, icon: "☕" });
    const cleared = await request(app).patch(`${V1}/admin/categories/${c.id}`).set(owner.h).send({ icon: null });
    expect(cleared.body.icon).toBeNull();
    expect((await request(app).patch(`${V1}/admin/categories/999999`).set(owner.h).send({ name: "x" })).status).toBe(404);
  });

  it("reorders, and the app follows the new order", async () => {
    const ids = (await adminList()).map((c) => c.id);
    const reversed = [...ids].reverse();
    const res = await request(app).put(`${V1}/admin/categories/order`).set(owner.h).send({ ids: reversed });
    expect(res.status).toBe(200);
    expect(res.body.map((c: { id: number }) => c.id)).toEqual(reversed);
    const appOrder = (await request(app).get(`${V1}/categories`)).body.map((c: { id: number }) => c.id);
    expect(appOrder).toEqual(reversed);
    // A stale or partial list is refused rather than half-applied.
    expect((await request(app).put(`${V1}/admin/categories/order`).set(owner.h).send({ ids: reversed.slice(1) })).status).toBe(409);
    expect((await request(app).put(`${V1}/admin/categories/order`).set(owner.h).send({ ids: [...reversed, reversed[0]] })).status).toBe(409);
  });

  it("deletes only empty categories and says how many products to move", async () => {
    const c = (await create(`${TAG} Snacks`)).body;
    await pool.query("insert into products (name, price, category_id) values ($1, 1000, $2), ($3, 1000, $2)", [
      `${TAG} crisps`, c.id, `${TAG} nuts`,
    ]);
    expect((await adminList()).find((x) => x.id === c.id)!.productCount).toBe(2);
    const blocked = await request(app).delete(`${V1}/admin/categories/${c.id}`).set(owner.h);
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/2 products are still in/);

    await pool.query("delete from products where category_id = $1", [c.id]);
    await request(app).delete(`${V1}/admin/categories/${c.id}`).set(owner.h).expect(204);
    expect((await adminList()).some((x) => x.id === c.id)).toBe(false);
  });

  it("staff and customers can't manage categories", async () => {
    expect((await request(app).get(`${V1}/admin/categories`).set(staff.h)).status).toBe(403);
    expect((await request(app).post(`${V1}/admin/categories`).set(staff.h).send({ name: `${TAG} nope` })).status).toBe(403);
    expect((await request(app).post(`${V1}/admin/categories`).send({ name: `${TAG} nope` })).status).toBe(401);
  });

  it("validates input", async () => {
    expect((await create("   ")).status).toBe(400);
    expect((await create(`${TAG} long icon`, "x".repeat(17))).status).toBe(400);
    expect((await request(app).patch(`${V1}/admin/categories/1`).set(owner.h).send({})).status).toBe(400);
  });
});
