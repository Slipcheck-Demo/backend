// Adapted from .claude/skills/api-test-supertest/scripts/templates/jest.config.cjs
// (naodeng/awesome-qa-skills, PolyForm Noncommercial 1.0.0 — see that skill's SKILL.md).
// Added the ts-jest transform since this project is TypeScript, not plain JS.
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  passWithNoTests: true,
};
