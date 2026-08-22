module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/?(*.)+(spec|test).ts',
    '**/?(*.)+(spec|test).js'
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    'tests[/\\\\].*\\.js$': 'ts-jest',
  },
  moduleNameMapper: {
    '../src/rustyleaf-api': '<rootDir>/tests/__mocks__/rustyleaf-api-mock.cjs',
    'rustyleaf_core_bg\\.js$': '<rootDir>/tests/__mocks__/wasmMock.js',
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|sass|scss)$': '<rootDir>/tests/__mocks__/styleMock.js',
    '\\.(gif|ttf|eot|svg|png|jpg|jpeg)$': '<rootDir>/tests/__mocks__/fileMock.js'
  },
  transformIgnorePatterns: [
    'node_modules/',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  verbose: true
};
