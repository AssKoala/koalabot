import { JestConfigWithTsJest  } from 'ts-jest'
  
const jestConfig: JestConfigWithTsJest  = {
    extensionsToTreatAsEsm: ['.ts'],
    verbose: true,
    preset: 'ts-jest',
    resolver: "ts-jest-resolver",
    testEnvironment: 'node',
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { useESM: true }]
    },
    testPathIgnorePatterns: ['/node_modules/', 'build'],
    moduleDirectories: ["node_modules", "build"],
}
  
export default jestConfig
