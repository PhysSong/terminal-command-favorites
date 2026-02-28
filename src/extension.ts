import * as vscode from 'vscode';

type FavoriteScope = 'user' | 'workspace';
type FavoriteConfigEntry = string | { label?: string; command: string };

type Favorite = {
	scope: FavoriteScope;
	index: number;
	label: string;
	command: string;
};

type FavoritesTreeNode = ScopeTreeItem | FavoriteTreeItem;
type FavoritesSummary = {
	total: number;
	userTotal: number;
	workspaceTotal: number;
	visibleTotal: number;
	userVisible: number;
	workspaceVisible: number;
};

const COMMAND_PREVIEW_LENGTH = 60;
const DOUBLE_CLICK_WINDOW_MS = 500;

function commandPreview(command: string): string {
	const normalized = command.replace(/\s+/g, ' ').trim();
	if (normalized.length <= COMMAND_PREVIEW_LENGTH) {
		return normalized;
	}
	return `${normalized.slice(0, COMMAND_PREVIEW_LENGTH - 3)}...`;
}

class ScopeTreeItem extends vscode.TreeItem {
	constructor(
		public readonly scope: FavoriteScope,
		visibleCount: number,
		totalCount: number,
		isFiltered: boolean
	) {
		const title = scope === 'user' ? 'User Settings' : 'Workspace Settings';
		const countLabel = isFiltered ? `${visibleCount}/${totalCount}` : `${totalCount}`;
		super(`${title} (${countLabel})`, vscode.TreeItemCollapsibleState.Expanded);
		this.contextValue = 'favoritesGroup';
		this.iconPath = new vscode.ThemeIcon(scope === 'user' ? 'account' : 'folder');
		this.description = scope === 'user' ? 'Global' : 'Local';
	}
}

class FavoriteTreeItem extends vscode.TreeItem {
	constructor(public readonly favorite: Favorite) {
		super(favorite.label, vscode.TreeItemCollapsibleState.None);
		this.description = commandPreview(favorite.command);
		const tooltip = new vscode.MarkdownString();
		tooltip.appendText(favorite.label);
		tooltip.appendMarkdown('\n\n');
		tooltip.appendCodeblock(favorite.command, 'shell');
		tooltip.appendMarkdown(`\n${scopeLabel(favorite.scope)} settings`);
		this.tooltip = tooltip;
		this.contextValue = 'favoriteItem';
		this.iconPath = new vscode.ThemeIcon('terminal');
		this.command = {
			command: 'terminal-command-favorites.runFavoriteFromTreeItem',
			title: 'Run Favorite Command (Double-click)',
			arguments: [this]
		};
	}
}

class FavoritesTreeDataProvider implements vscode.TreeDataProvider<FavoritesTreeNode> {
	private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<FavoritesTreeNode | undefined | void>();
	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
	private filterQuery = '';

	private matchesFilter(favorite: Favorite): boolean {
		if (!this.filterQuery) {
			return true;
		}
		const query = this.filterQuery;
		return favorite.label.toLowerCase().includes(query) || favorite.command.toLowerCase().includes(query);
	}

	private getVisibleFavoritesForScope(scope: FavoriteScope): Favorite[] {
		return getFavoritesForScope(scope).filter((favorite) => this.matchesFilter(favorite));
	}

	getSummary(): FavoritesSummary {
		const userFavorites = getFavoritesForScope('user');
		const workspaceFavorites = hasWorkspace() ? getFavoritesForScope('workspace') : [];
		const userVisibleFavorites = userFavorites.filter((favorite) => this.matchesFilter(favorite));
		const workspaceVisibleFavorites = workspaceFavorites.filter((favorite) => this.matchesFilter(favorite));

		return {
			total: userFavorites.length + workspaceFavorites.length,
			userTotal: userFavorites.length,
			workspaceTotal: workspaceFavorites.length,
			visibleTotal: userVisibleFavorites.length + workspaceVisibleFavorites.length,
			userVisible: userVisibleFavorites.length,
			workspaceVisible: workspaceVisibleFavorites.length
		};
	}

	getFilterQuery(): string {
		return this.filterQuery;
	}

	hasFilter(): boolean {
		return this.filterQuery.length > 0;
	}

	setFilterQuery(query: string): void {
		this.filterQuery = query.trim().toLowerCase();
		this.refresh();
	}

	getTreeItem(element: FavoritesTreeNode): vscode.TreeItem {
		return element;
	}

	getChildren(element?: FavoritesTreeNode): FavoritesTreeNode[] {
		if (!element) {
			const summary = this.getSummary();
			if (summary.total === 0) {
				return [];
			}

			const groups: FavoritesTreeNode[] = [];
			const includeEmptyGroups = !this.hasFilter();
			if (summary.userVisible > 0 || includeEmptyGroups) {
				groups.push(new ScopeTreeItem('user', summary.userVisible, summary.userTotal, this.hasFilter()));
			}
			if (hasWorkspace() && (summary.workspaceVisible > 0 || includeEmptyGroups)) {
				groups.push(new ScopeTreeItem('workspace', summary.workspaceVisible, summary.workspaceTotal, this.hasFilter()));
			}
			return groups;
		}

		if (element instanceof ScopeTreeItem) {
			return this.getVisibleFavoritesForScope(element.scope).map((favorite) => new FavoriteTreeItem(favorite));
		}

		return [];
	}

	refresh(): void {
		this.onDidChangeTreeDataEmitter.fire();
	}
}

function getConfig(): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration('terminalCommandFavorites');
}

function hasWorkspace(): boolean {
	return (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
}

function scopeLabel(scope: FavoriteScope): string {
	return scope === 'user' ? 'User' : 'Workspace';
}

function parseFavorites(entries: FavoriteConfigEntry[] | undefined, scope: FavoriteScope): Favorite[] {
	if (!entries || entries.length === 0) {
		return [];
	}

	const favorites: Favorite[] = [];
	for (const entry of entries) {
		if (typeof entry === 'string') {
			if (entry.trim().length === 0) {
				continue;
			}
			favorites.push({
				scope,
				index: favorites.length,
				label: entry,
				command: entry
			});
			continue;
		}

		if (entry && typeof entry.command === 'string' && entry.command.trim().length > 0) {
			favorites.push({
				scope,
				index: favorites.length,
				label: (entry.label || entry.command).trim() || entry.command,
				command: entry.command
			});
		}
	}

	return favorites;
}

function getFavoritesForScope(scope: FavoriteScope): Favorite[] {
	const inspected = getConfig().inspect<FavoriteConfigEntry[]>('commands');
	const entries = scope === 'user' ? inspected?.globalValue : inspected?.workspaceValue;
	return parseFavorites(entries, scope);
}

function getAllFavorites(): Favorite[] {
	return [...getFavoritesForScope('workspace'), ...getFavoritesForScope('user')];
}

async function saveFavorites(scope: FavoriteScope, favorites: Favorite[]): Promise<void> {
	if (scope === 'workspace' && !hasWorkspace()) {
		throw new Error('No workspace is open.');
	}

	const entries = favorites.map((favorite) => ({
		label: favorite.label,
		command: favorite.command
	}));

	const target = scope === 'user'
		? vscode.ConfigurationTarget.Global
		: vscode.ConfigurationTarget.Workspace;
	await getConfig().update('commands', entries, target);
}

async function chooseScope(placeHolder: string): Promise<FavoriteScope | undefined> {
	const choices: Array<{ label: string; description: string; scope: FavoriteScope }> = [
		{ label: 'User Settings', description: 'Available in all workspaces', scope: 'user' }
	];
	if (hasWorkspace()) {
		choices.push({ label: 'Workspace Settings', description: 'Only in the current workspace', scope: 'workspace' });
	}

	if (choices.length === 1) {
		return choices[0].scope;
	}

	const picked = await vscode.window.showQuickPick(choices, { placeHolder });
	return picked?.scope;
}

async function chooseFavorite(placeHolder: string): Promise<Favorite | undefined> {
	const favorites = getAllFavorites();
	if (favorites.length === 0) {
		return undefined;
	}

	const picked = await vscode.window.showQuickPick(
		favorites.map((favorite) => ({
			label: favorite.label,
			description: favorite.command,
			detail: `${scopeLabel(favorite.scope)} settings`,
			favorite
		})),
		{ placeHolder }
	);
	return picked?.favorite;
}

function runInTerminal(command: string): void {
	const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal('Terminal');
	terminal.show(true);
	if (terminal.shellIntegration) {
		try {
			terminal.shellIntegration.executeCommand(command);
			return;
		} catch {
			// Fall back to regular sendText if shell integration fails (e.g. due to unsupported terminal type)
		}
	}
	terminal.sendText(command, true);
}

function scopeFromNode(node?: FavoritesTreeNode): FavoriteScope | undefined {
	if (!node) {
		return undefined;
	}
	if (node instanceof ScopeTreeItem) {
		return node.scope;
	}
	return node.favorite.scope;
}

export function activate(context: vscode.ExtensionContext) {
	const provider = new FavoritesTreeDataProvider();
	const treeView = vscode.window.createTreeView('terminalCommandFavoritesView', {
		treeDataProvider: provider
	});
	context.subscriptions.push(treeView);
	let pendingTreeRun:
		| { key: string; expiresAt: number }
		| undefined;

	const updateViewState = (): void => {
		const summary = provider.getSummary();
		treeView.badge = summary.total > 0
			? { value: summary.total, tooltip: `${summary.total} favorite command${summary.total === 1 ? '' : 's'}` }
			: undefined;

		if (provider.hasFilter()) {
			const filterQuery = provider.getFilterQuery();
			treeView.message = summary.visibleTotal > 0
				? `Filtering by "${filterQuery}" (${summary.visibleTotal}/${summary.total})`
				: `No favorites match "${filterQuery}".`;
		} else {
			treeView.message = undefined;
		}

		void vscode.commands.executeCommand('setContext', 'terminalCommandFavorites.hasFavorites', summary.total > 0);
		void vscode.commands.executeCommand('setContext', 'terminalCommandFavorites.hasFilter', provider.hasFilter());
	};

	const moveFavorite = async (item: FavoriteTreeItem | undefined, direction: -1 | 1): Promise<void> => {
		const target = item?.favorite ?? await chooseFavorite(
			direction < 0 ? 'Select a favorite to move up' : 'Select a favorite to move down'
		);
		if (!target) {
			return;
		}

		const favorites = getFavoritesForScope(target.scope);
		if (!favorites[target.index]) {
			vscode.window.showErrorMessage('Favorite no longer exists.');
			return;
		}

		const nextIndex = target.index + direction;
		if (nextIndex < 0 || nextIndex >= favorites.length) {
			const position = direction < 0 ? 'top' : 'bottom';
			vscode.window.showInformationMessage(`"${target.label}" is already at the ${position} of ${scopeLabel(target.scope)} settings.`);
			return;
		}

		const [favorite] = favorites.splice(target.index, 1);
		favorites.splice(nextIndex, 0, favorite);
		await saveFavorites(target.scope, favorites);
		provider.refresh();
	};

	const refreshSubscription = provider.onDidChangeTreeData(() => updateViewState());
	context.subscriptions.push(refreshSubscription);
	updateViewState();

	const runFavoriteDisposable = vscode.commands.registerCommand('terminal-command-favorites.runFavorite', async () => {
		const favorite = await chooseFavorite('Select a terminal command to run');
		if (!favorite) {
			const addNow = 'Open Settings';
			const action = await vscode.window.showWarningMessage(
				'No favorite commands configured in user or workspace settings.',
				addNow
			);
			if (action === addNow) {
				await vscode.commands.executeCommand('workbench.action.openSettings', 'terminalCommandFavorites.commands');
			}
			return;
		}
		runInTerminal(favorite.command);
	});

	const runFromSidebarDisposable = vscode.commands.registerCommand(
		'terminal-command-favorites.runFavoriteFromSidebar',
		(item?: FavoriteTreeItem) => {
			if (!item) {
				return;
			}
			runInTerminal(item.favorite.command);
		}
	);

	const runFromTreeItemDisposable = vscode.commands.registerCommand(
		'terminal-command-favorites.runFavoriteFromTreeItem',
		(item?: FavoriteTreeItem) => {
			if (!item) {
				return;
			}

			const now = Date.now();
			const key = `${item.favorite.scope}:${item.favorite.index}:${item.favorite.label}:${item.favorite.command}`;
			if (pendingTreeRun && pendingTreeRun.key === key && now <= pendingTreeRun.expiresAt) {
				pendingTreeRun = undefined;
				runInTerminal(item.favorite.command);
				return;
			}

			pendingTreeRun = { key, expiresAt: now + DOUBLE_CLICK_WINDOW_MS };
			void vscode.window.setStatusBarMessage(
				`Double-click "${item.favorite.label}" to run`,
				DOUBLE_CLICK_WINDOW_MS
			);
		}
	);

	const copyFavoriteDisposable = vscode.commands.registerCommand(
		'terminal-command-favorites.copyFavoriteCommand',
		async (item?: FavoriteTreeItem) => {
			const target = item?.favorite ?? await chooseFavorite('Select a favorite command to copy');
			if (!target) {
				return;
			}

			await vscode.env.clipboard.writeText(target.command);
			vscode.window.showInformationMessage(`Copied "${target.label}" command to clipboard.`);
		}
	);

	const addFavoriteDisposable = vscode.commands.registerCommand(
		'terminal-command-favorites.addFavorite',
		async (node?: FavoritesTreeNode) => {
			const scope = scopeFromNode(node) ?? await chooseScope('Save favorite to');
			if (!scope) {
				return;
			}

			if (scope === 'workspace' && !hasWorkspace()) {
				vscode.window.showErrorMessage('No workspace is open. Open a folder to save workspace favorites.');
				return;
			}

			const command = await vscode.window.showInputBox({
				prompt: 'Command to send to terminal',
				ignoreFocusOut: true,
				validateInput: (value) => value.trim().length === 0 ? 'Command is required.' : undefined
			});
			if (!command) {
				return;
			}

			const labelInput = await vscode.window.showInputBox({
				prompt: 'Label shown in favorites list (optional)',
				ignoreFocusOut: true,
				value: command
			});
			if (labelInput === undefined) {
				return;
			}

			const favorites = getFavoritesForScope(scope);
			favorites.push({
				scope,
				index: favorites.length,
				label: labelInput.trim() || command,
				command
			});
			await saveFavorites(scope, favorites);
			provider.refresh();
		}
	);

	const editFavoriteDisposable = vscode.commands.registerCommand(
		'terminal-command-favorites.editFavorite',
		async (item?: FavoriteTreeItem) => {
			const target = item?.favorite ?? await chooseFavorite('Select a favorite to edit');
			if (!target) {
				return;
			}

			const command = await vscode.window.showInputBox({
				prompt: 'Command to send to terminal',
				ignoreFocusOut: true,
				value: target.command,
				validateInput: (value) => value.trim().length === 0 ? 'Command is required.' : undefined
			});
			if (!command) {
				return;
			}

			const labelInput = await vscode.window.showInputBox({
				prompt: 'Label shown in favorites list (optional)',
				ignoreFocusOut: true,
				value: target.label
			});
			if (labelInput === undefined) {
				return;
			}

			const favorites = getFavoritesForScope(target.scope);
			if (!favorites[target.index]) {
				vscode.window.showErrorMessage('Favorite no longer exists.');
				return;
			}
			favorites[target.index] = {
				scope: target.scope,
				index: target.index,
				label: labelInput.trim() || command,
				command
			};
			await saveFavorites(target.scope, favorites);
			provider.refresh();
		}
	);

	const moveFavoriteUpDisposable = vscode.commands.registerCommand(
		'terminal-command-favorites.moveFavoriteUp',
		async (item?: FavoriteTreeItem) => {
			await moveFavorite(item, -1);
		}
	);

	const moveFavoriteDownDisposable = vscode.commands.registerCommand(
		'terminal-command-favorites.moveFavoriteDown',
		async (item?: FavoriteTreeItem) => {
			await moveFavorite(item, 1);
		}
	);

	const deleteFavoriteDisposable = vscode.commands.registerCommand(
		'terminal-command-favorites.deleteFavorite',
		async (item?: FavoriteTreeItem) => {
			const target = item?.favorite ?? await chooseFavorite('Select a favorite to delete');
			if (!target) {
				return;
			}

			const confirmed = await vscode.window.showWarningMessage(
				`Delete favorite "${target.label}" from ${scopeLabel(target.scope)} settings?`,
				{ modal: true },
				'Delete'
			);
			if (confirmed !== 'Delete') {
				return;
			}

			const favorites = getFavoritesForScope(target.scope);
			if (!favorites[target.index]) {
				vscode.window.showErrorMessage('Favorite no longer exists.');
				return;
			}
			favorites.splice(target.index, 1);
			await saveFavorites(target.scope, favorites);
			provider.refresh();
		}
	);

	const filterFavoritesDisposable = vscode.commands.registerCommand(
		'terminal-command-favorites.filterFavorites',
		async () => {
			const value = await vscode.window.showInputBox({
				prompt: 'Filter favorites by label or command',
				placeHolder: 'Type text and press Enter. Leave empty to clear.',
				ignoreFocusOut: true,
				value: provider.getFilterQuery()
			});
			if (value === undefined) {
				return;
			}

			provider.setFilterQuery(value);
		}
	);

	const clearFavoritesFilterDisposable = vscode.commands.registerCommand(
		'terminal-command-favorites.clearFavoritesFilter',
		() => {
			provider.setFilterQuery('');
		}
	);

	const configWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('terminalCommandFavorites.commands')) {
			provider.refresh();
		}
	});

	context.subscriptions.push(
		runFavoriteDisposable,
		runFromSidebarDisposable,
		runFromTreeItemDisposable,
		copyFavoriteDisposable,
		addFavoriteDisposable,
		editFavoriteDisposable,
		moveFavoriteUpDisposable,
		moveFavoriteDownDisposable,
		deleteFavoriteDisposable,
		filterFavoritesDisposable,
		clearFavoritesFilterDisposable,
		configWatcher
	);

	const openSettingsDisposable = vscode.commands.registerCommand('terminal-command-favorites.openSettings', async () => {
		await vscode.commands.executeCommand('workbench.action.openSettings', 'terminalCommandFavorites.commands');
	});

	context.subscriptions.push(openSettingsDisposable);
}

export function deactivate() {}
