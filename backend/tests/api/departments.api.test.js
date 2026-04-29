const request = require('supertest');
const { createRoleAwareTestApp } = require('../utils/testAppFactory');

describe('Department API contract tests', () => {
  const app = createRoleAwareTestApp((req, res) => {
    if (req.method === 'POST') {
      return res.status(201).json({ id: 'dep-1', name: req.body.name, code: req.body.code });
    }

    if (req.method === 'PUT') {
      return res.status(200).json({ id: 'dep-1', name: req.body.name });
    }

    if (req.method === 'DELETE') {
      return res.status(200).json({ id: 'dep-1', isActive: false });
    }

    return res.status(200).json([{ id: 'dep-1', name: 'CSE', code: 'CSE' }]);
  }, ['admin', 'principal']);

  test('admin can create department', async () => {
    const response = await request(app)
      .post('/test')
      .set('x-test-role', 'admin')
      .send({ name: 'Computer Science', code: 'CSE' });

    expect(response.status).toBe(201);
  });

  test('faculty cannot create department', async () => {
    const response = await request(app)
      .post('/test')
      .set('x-test-role', 'faculty')
      .send({ name: 'Mechanical', code: 'ME' });

    expect(response.status).toBe(403);
  });
});
