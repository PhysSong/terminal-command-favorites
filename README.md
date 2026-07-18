# Terminal Command Favorites

Save the terminal commands you use most often and run them without retyping them.
Terminal Command Favorites adds a dedicated view to the VS Code Activity Bar and keeps favorites
in either your user settings or the current workspace.

## Features

- **Run commands quickly** from the Command Palette, the Favorites view's play button, or by
  double-clicking a favorite. Commands run in the active terminal, or in a new terminal when none
  is open.
- **Add favorites manually** with an optional display label.
- **Add a recently executed command** without copying and pasting it. Recent-command capture uses
  VS Code terminal shell integration.
- **Choose where favorites live:** User favorites are available in every workspace, while Workspace
  favorites are stored only for the current workspace.
- **Organize with drag and drop.** Reorder favorites within a settings group, drag them onto the
  other group to change scope, or use the context-menu action to move them between scopes.
- **Filter by label or command** from the Favorites view toolbar.
- **Edit, copy, or delete** a favorite from its inline and context-menu actions.
- **See command details at a glance** with command previews, full-command tooltips, per-scope counts,
  and an Activity Bar badge showing the total number of favorites.
- **Edit favorites directly in Settings** using either simple command strings or labeled command
  objects.

## Getting started

1. Open **Terminal Favorites** in the Activity Bar.
2. Select **Add Favorite** in the empty view, or use the add button beside the User Settings or
   Workspace Settings group.
3. Enter the command and, optionally, a shorter label.
4. Double-click the favorite or select its play button to run it.

You can also use these commands from the Command Palette:

- `Terminal Command Favorites: Run Favorite Command`
- `Terminal Command Favorites: Add Favorite`
- `Terminal Command Favorites: Add Favorite from Recent Commands`
- `Terminal Command Favorites: Open Settings`

To add from recent commands, first run a command in a terminal with
[shell integration](https://code.visualstudio.com/docs/terminal/shell-integration) enabled. The
extension keeps up to 20 unique commands observed during the current VS Code session.

## Configuration

The `terminalCommandFavorites.commands` setting accepts command strings:

```json
{
  "terminalCommandFavorites.commands": [
    "npm test",
    "git status"
  ]
}
```

Use objects when a command should have a custom label:

```json
{
  "terminalCommandFavorites.commands": [
    {
      "label": "Run unit tests",
      "command": "npm test"
    },
    {
      "label": "Start development server",
      "command": "npm run dev"
    }
  ]
}
```

Set the value in User Settings to make the favorites global, or in Workspace Settings (for example,
`.vscode/settings.json`) to keep them project-specific. Both scopes appear together in the Favorites
view and in the command picker.

## Requirements

- VS Code 1.109.0 or later
- Terminal shell integration for recent-command capture; all other features work without it

## License

[MIT](LICENSE)
