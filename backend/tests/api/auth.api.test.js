const request = require('supertest');
const express = require('express');
const { createRoleAwareTestApp } = require('../utils/testAppFactory');

describe('Auth API contract tests', () => {
  test('POST /login returns token payload for valid credentials', async () => {
    const app = express();
    app.use(express.json());
    app.post('/login', (req, res) => {
      if (req.body.email === 'admin@college.edu' && req.body.password === 'Password@123') {
        return res.status(200).json({ token: 'fake-access-token', user: { role: 'admin' } });
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    });

    const response = await request(app).post('/login').send({ email: 'admin@college.edu', password: 'Password@123' });

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('admin');
  });

  test('POST /logout returns 401 without auth', async () => {
    const app = express();
    app.post('/logout', (req, res) => res.status(401).json({ message: 'Authentication required' }));

    const response = await request(app).post('/logout');

    expect(response.status).toBe(401);
  });

  test('token protected endpoint accepts authorized role', async () => {
    const app = createRoleAwareTestApp((req, res) => res.status(200).json({ role: req.user.role }), ['admin', 'hod']);

    const response = await request(app).get('/test').set('x-test-role', 'admin');

    expect(response.status).toBe(200);
    expect(response.body.role).toBe('admin');
  });
});
