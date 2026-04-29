const request = require('supertest');
const express = require('express');
const { authorize } = require('../../src/middlewares/roleCheck');

describe('Security integration tests', () => {
  const app = express();
  app.get('/secure', (req, res, next) => {
    const role = req.headers['x-test-role'];
    if (!role) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    req.user = { role };
    return next();
  }, authorize('admin', 'hod'), (req, res) => res.status(200).json({ ok: true }));

  test('returns 401 when unauthenticated', async () => {
    const response = await request(app).get('/secure');
    expect(response.status).toBe(401);
  });

  test('returns 403 for disallowed role', async () => {
    const response = await request(app).get('/secure').set('x-test-role', 'student');
    expect(response.status).toBe(403);
  });

  test('returns 200 for allowed role', async () => {
    const response = await request(app).get('/secure').set('x-test-role', 'admin');
    expect(response.status).toBe(200);
  });
});
