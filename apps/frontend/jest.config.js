/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: [
    '<rootDir>/lib/__tests__/**/*.test.ts',
    '<rootDir>/app/__tests__/**/*.test.tsx',
  ],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          isolatedModules: true,
          jsx: 'react-jsx',
          module: 'commonjs',
          moduleResolution: 'node',
          strict: true,
          target: 'ES2020',
        },
      },
    ],
  },
};
