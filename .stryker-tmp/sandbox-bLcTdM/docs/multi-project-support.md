# Multi-Project Support

Colony now supports working with multiple projects by allowing you to specify a custom working directory when creating a session.

## How It Works

1. **Skills are centralized**: All skills remain in Colony's `skills/` directory and are shared across all projects
2. **Working directory is per-session**: Each chat room can have its own working directory
3. **Automatic symlink creation**: Colony automatically creates `.claude/skills` and `.gemini/skills` symlinks in the working directory pointing to Colony's skills

## Usage

### Creating a Session with Custom Working Directory

**Via Web UI:**
1. Click "创建新会话" button
2. Enter session name
3. (Optional) Enter working directory path, e.g., `/Users/username/projects/my-app`
4. Leave empty to use Colony's directory
5. Click "创建"

**Via Discord:**
```
/colony create MyProject --dir /path/to/your/project
/colony create MyProject architect,developer --dir /path/to/your/project
```

**Via API:**
```bash
curl -X POST http://localhost:3001/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Project Session",
    "agentIds": ["architect", "developer"],
    "workingDir": "/path/to/your/project"
  }'
```

**Via Colony API:**
```typescript
const colony = new Colony();
const sessionId = colony.createSession(
  "My Project Session",
  ["architect", "developer"],
  "/path/to/your/project"  // Working directory
);
```

### What Happens

When you create a session with a `workingDir`:

1. Colony stores the working directory with the session
2. When an agent processes a message, it:
   - Checks if the room has a custom working directory
   - Creates `.claude/skills` and `.gemini/skills` symlinks if they don't exist
   - Spawns the CLI with `cwd` set to the working directory

### Example

```typescript
// Create a session for a React project
const reactSessionId = colony.createSession(
  "React App Development",
  ["architect", "developer"],
  "/Users/username/projects/my-react-app"
);

// Create a session for a Python project
const pythonSessionId = colony.createSession(
  "Python API Development",
  ["architect", "qa-lead"],
  "/Users/username/projects/my-python-api"
);
```

Now agents in each session will work in their respective project directories, but all will have access to the same Colony skills.

## Benefits

- **Isolation**: Each project has its own working directory
- **Shared Skills**: All projects use the same skill definitions
- **No Manual Setup**: Symlinks are created automatically
- **Session Persistence**: Working directory is saved with the session

## Technical Details

### Symlink Creation

Colony creates symlinks in the working directory:
```
/path/to/your/project/
  .claude/
    skills -> /path/to/Colony/skills
  .gemini/
    skills -> /path/to/Colony/skills
```

### CLI Invocation

When invoking the CLI, Colony passes:
- `cwd`: The working directory
- `env.COLONY_*`: Environment variables for skill execution

### Session Persistence

The working directory is saved in the session data and restored when the session is loaded.

## Limitations

1. **Skills must be in Colony directory**: You cannot have project-specific skills (yet)
2. **Symlink permissions**: The user must have permission to create symlinks in the working directory
3. **CLI support**: Both Claude CLI and Gemini CLI must support the current working directory mechanism

## Future Enhancements

- Support for project-specific skill overrides
- Automatic detection of project type and skill recommendations
- Per-project skill configuration
