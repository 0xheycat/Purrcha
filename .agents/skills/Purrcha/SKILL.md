```markdown
# Purrcha Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and workflows used in the Purrcha codebase, a TypeScript project built with Next.js. You'll learn about the project's coding conventions, file organization, commit patterns, and how to safely update API endpoints following established procedures.

## Coding Conventions

### File Naming
- **PascalCase** is used for file names.
  - Example: `UserProfile.tsx`, `AgentRunRoute.ts`

### Import Style
- **Alias imports** are preferred for referencing modules.
  ```typescript
  import { fetchAgent } from '@/lib/agent';
  import { UserProfile } from '@/components/UserProfile';
  ```

### Export Style
- **Named exports** are used throughout the codebase.
  ```typescript
  // Good
  export function fetchAgent() { ... }

  // Avoid default exports
  // export default function fetchAgent() { ... }
  ```

### Commit Patterns
- **Conventional commits** are used, with prefixes such as `fix`.
- Commit messages are concise, averaging 55 characters.
  - Example: `fix: correct agent run endpoint response`

## Workflows

### API Endpoint Update
**Trigger:** When someone needs to fix or modify the logic of an existing API endpoint.  
**Command:** `/update-api-endpoint`

1. **Edit the relevant API route file**  
   Locate the endpoint in `src/app/api/...` and make the necessary changes.  
   Example:
   ```typescript
   // src/app/api/agent/run/route.ts
   export async function POST(req: Request) {
     // updated logic here
   }
   ```

2. **Update related hooks or libraries if necessary**  
   If the endpoint logic affects custom hooks or utility libraries, update them to match the new API behavior.

3. **Modify or add related components that consume the API**  
   Ensure that UI components using this endpoint are updated to handle any changes in response shape or error handling.

4. **Update documentation or configuration as needed**  
   If the API contract changes, update any relevant documentation or configuration files to reflect the new behavior.

## Testing Patterns

- **Test files** follow the pattern `*.test.*` (e.g., `AgentRunRoute.test.ts`).
- The specific testing framework is not detected, but tests are colocated with or near the files they test.
- Example test file structure:
  ```typescript
  // AgentRunRoute.test.ts
  import { POST } from './AgentRunRoute';

  describe('POST /api/agent/run', () => {
    it('should return 200 on success', async () => {
      // test implementation
    });
  });
  ```

## Commands

| Command              | Purpose                                           |
|----------------------|---------------------------------------------------|
| /update-api-endpoint | Update or fix an existing API endpoint implementation |
```
