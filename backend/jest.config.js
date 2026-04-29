module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./tests/setup.js'],
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/config/seeder.js',
    '!src/server.js'
  ],
  coverageThreshold: process.env.ENFORCE_COVERAGE === 'true' ? {
    global: { lines: 70, functions: 70, branches: 60 }
  } : undefined,
  coverageReporters: ['text', 'lcov', 'html'],
  testPathIgnorePatterns: ['/node_modules/'],
  moduleNameMapper: { '^@/(.*)$': '/src/$1' }
}
