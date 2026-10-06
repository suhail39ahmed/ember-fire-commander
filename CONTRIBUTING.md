# Contributing to EMBER

Thank you for your interest in contributing to EMBER! This document outlines the development workflow, branch naming conventions, and pull request process.

## Development Workflow

### 1. Branch Naming Convention

All feature branches must follow this pattern:

```
cursor/<descriptive-name>-1233
```

Examples:
- `cursor/add-volunteer-pwa-1233`
- `cursor/implement-aggregator-stage1-1233`
- `cursor/fix-websocket-reconnection-1233`

**Important:**
- Always use the `cursor/` prefix
- Use lowercase letters only (case-insensitive filesystems cannot hold branches that differ only in casing)
- Use hyphens to separate words in descriptive names
- Always append the `-1233` suffix
- Keep names concise but descriptive

### 2. Creating a Branch

```bash
git checkout main
git pull origin main
git checkout -b cursor/<descriptive-name>-1233
```

### 3. Making Changes

- Write clear, descriptive commit messages
- Commit logical units of work
- Test your changes locally before pushing
- Follow the existing code style and conventions

### 4. Commit Messages

Use clear, imperative commit messages:

```
Add voice-gateway WebSocket endpoint

Implement Firebase ID token verification on upgrade
Add Gemini Live session management
Include per-user Live-minute cap enforcement
```

### 5. Pushing Your Branch

```bash
git add .
git commit -m "Your descriptive commit message"
git push -u origin cursor/<descriptive-name>-1233
```

If push fails due to network errors, retry up to 4 times with exponential backoff.

### 6. Creating a Pull Request

- Use the pull request template (`.github/PULL_REQUEST_TEMPLATE.md`)
- Link to related issues if applicable
- Provide context for reviewers
- Mark as draft if work is in progress

## Code Review Process

1. At least one approval required before merging
2. All CI checks must pass
3. Resolve all review comments
4. Squash or rebase commits as appropriate

## Testing Guidelines

### Unit Tests
- Write tests for new functionality
- Maintain existing test coverage
- Run tests locally before pushing: `pytest` (Python) or `npm test` (JavaScript/TypeScript)

### Integration Tests
- Test service interactions (e.g., Firestore triggers, WebSocket connections)
- Use Firebase emulators for local integration testing

### End-to-End Tests
- Test critical user workflows (volunteer report submission, supervisor approval)
- Manual testing on multiple devices (Android, iOS, desktop)

## Code Style

### Python
- Follow PEP 8
- Use type hints where appropriate
- Maximum line length: 100 characters
- Use `black` for formatting
- Use `ruff` or `flake8` for linting

### TypeScript / JavaScript
- Follow the project's ESLint configuration
- Use Prettier for formatting
- Prefer functional components and hooks (React)
- Use meaningful variable and function names

### General
- No commented-out code in commits
- Remove debug print statements before committing
- Add docstrings for public functions and classes
- Keep functions small and focused

## Environment Variables & Secrets

- **Never commit secrets, API keys, or service account files**
- Use `.env.example` files to document required environment variables
- Store secrets in Secret Manager (production) or `.env` files (local, gitignored)

## Documentation

- Update README files when adding new features or services
- Document API endpoints and request/response formats
- Add inline comments for complex logic
- Update architecture diagrams if infrastructure changes

## Issue Reporting

When reporting bugs or requesting features:
1. Search existing issues first
2. Provide clear reproduction steps
3. Include environment details (OS, browser, device)
4. Attach screenshots or logs if helpful

## Questions?

If you have questions about contributing, please open a discussion or contact the team.

---

**Thank you for contributing to EMBER and helping village firefighters respond more effectively during haze crises!**
