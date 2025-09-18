import { http, HttpResponse } from 'msw';
import { server } from '../../test/setup';
import {
  fetchSavedViews,
  createSavedView,
  updateSavedView,
  deleteSavedView,
  setDefaultSavedView,
} from '../apiService';

const API = 'http://localhost:8080/api';
const userId = 'u-123';

describe('Saved Views API service', () => {
  it('lists, creates (handles 409), updates, sets default, and deletes', async () => {
    let views: any[] = [];

    server.use(
      http.get(`${API}/users/:userId/views`, () => {
        return HttpResponse.json(views);
      }),
      http.post(`${API}/users/:userId/views`, async ({ request, params }) => {
        const body = await request.json();
        const exists = views.some(v => v.name.toLowerCase() === String(body.name).toLowerCase());
        if (exists) return new HttpResponse('Conflict', { status: 409 });
        const v = {
          view_id: `v-${Date.now()}`,
          user_id: params.userId,
          name: body.name,
          criteria: body.criteria,
          origin: body.origin ?? null,
          description: body.description ?? null,
          isDefault: !!body.is_default,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (v.isDefault) views = views.map(x => ({ ...x, isDefault: false }));
        views.push(v);
        return HttpResponse.json(v, { status: 201 });
      }),
      http.put(`${API}/users/:userId/views/:viewId`, async ({ request, params }) => {
        const body = await request.json();
        const idx = views.findIndex(v => v.view_id === params.viewId);
        if (idx < 0) return new HttpResponse(null, { status: 404 });
        if (body.name) {
          const conflict = views.some(v => v.view_id !== params.viewId && v.name.toLowerCase() === String(body.name).toLowerCase());
          if (conflict) return new HttpResponse(null, { status: 409 });
        }
        let isDefault = views[idx].isDefault;
        if (body.is_default === true) {
          views = views.map(v => ({ ...v, isDefault: false }));
          isDefault = true;
        } else if (body.is_default === false) {
          isDefault = false;
        }
        const updated = {
          ...views[idx],
          name: body.name ?? views[idx].name,
          criteria: body.criteria ?? views[idx].criteria,
          origin: body.origin ?? views[idx].origin,
          description: body.description ?? views[idx].description,
          isDefault,
          updatedAt: new Date().toISOString(),
        };
        views[idx] = updated;
        return HttpResponse.json(updated);
      }),
      http.delete(`${API}/users/:userId/views/:viewId`, ({ params }) => {
        const before = views.length;
        views = views.filter(v => v.view_id !== params.viewId);
        if (views.length === before) return new HttpResponse(null, { status: 404 });
        return new HttpResponse(null, { status: 204 });
      }),
      http.put(`${API}/users/:userId/views/:viewId/default`, ({ params }) => {
        const idx = views.findIndex(v => v.view_id === params.viewId);
        if (idx < 0) return new HttpResponse(null, { status: 404 });
        views = views.map((v, i) => ({ ...v, isDefault: i === idx }));
        return HttpResponse.json(views[idx]);
      }),
    );

    // list empty
    expect(await fetchSavedViews(userId)).toEqual([]);

    // create first
    const v1 = await createSavedView(userId, { name: 'My View', criteria: { id: 'root', combinator: 'AND', rules: [] } });
    expect(v1.name).toBe('My View');

    // conflict
    await expect(createSavedView(userId, { name: 'my view', criteria: { id: 'root', combinator: 'AND', rules: [] } })).rejects.toMatchObject({ status: 409 });

    // update rename
    const v1u = await updateSavedView(userId, v1.id!, { name: 'Renamed View' });
    expect(v1u.name).toBe('Renamed View');

    // set default
    const v1d = await setDefaultSavedView(userId, v1.id!);
    expect(v1d.isDefault).toBe(true);

    // delete
    await deleteSavedView(userId, v1.id!);
    const after = await fetchSavedViews(userId);
    expect(after.length).toBe(0);
  });
});
