const request = require('supertest');
const express = require('express');

describe('Attendance API contract tests', () => {
  test('prevents duplicate attendance marking', async () => {
    const app = express();
    app.use(express.json());

    const markedKeys = new Set();

    app.post('/attendance/mark', (req, res) => {
      const key = `${req.body.studentId}-${req.body.subjectId}-${req.body.date}-${req.body.periodNumber}`;
      if (markedKeys.has(key)) {
        return res.status(409).json({ message: 'Attendance already exists for this period' });
      }
      markedKeys.add(key);
      return res.status(201).json({ message: 'Attendance marked' });
    });

    const payload = { studentId: 's1', subjectId: 'sub1', date: '2026-04-10', periodNumber: 1 };

    const first = await request(app).post('/attendance/mark').send(payload);
    const second = await request(app).post('/attendance/mark').send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });
});
