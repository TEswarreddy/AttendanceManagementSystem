const express = require('express');

function createRoleAwareTestApp(handler, allowedRoles = []) {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    const role = req.headers['x-test-role'];

    if (!role) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    req.user = { role, _id: '67f000000000000000000099' };

    if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
      return res.status(403).json({ message: 'Forbidden for this role' });
    }

    return next();
  });

  app.all('/test', handler);

  return app;
}

module.exports = { createRoleAwareTestApp };
