import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { applyFavoriteMove, Favorite, rememberRecentCommand } from '../extension';

function favorite(scope: 'user' | 'workspace', index: number, label: string): Favorite {
	return { scope, index, label, command: `echo ${label}` };
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Recent commands are trimmed, deduplicated, and newest first', () => {
		const recentCommands: string[] = [];

		rememberRecentCommand(recentCommands, '  npm test  ');
		rememberRecentCommand(recentCommands, 'npm run compile');
		rememberRecentCommand(recentCommands, 'npm test');
		rememberRecentCommand(recentCommands, '   ');

		assert.deepStrictEqual(recentCommands, ['npm test', 'npm run compile']);
	});

	test('Recent commands retain only the last 20 unique commands', () => {
		const recentCommands: string[] = [];

		for (let index = 0; index < 25; index += 1) {
			rememberRecentCommand(recentCommands, `command-${index}`);
		}

		assert.strictEqual(recentCommands.length, 20);
		assert.strictEqual(recentCommands[0], 'command-24');
		assert.strictEqual(recentCommands[19], 'command-5');
	});

	test('Dropping within a scope reorders in either direction', () => {
		const favorites = {
			user: [favorite('user', 0, 'one'), favorite('user', 1, 'two'), favorite('user', 2, 'three')],
			workspace: []
		};

		const movedDown = applyFavoriteMove(favorites, 'user', 0, 'user', 2);
		assert.deepStrictEqual(movedDown.favorites.user.map((item) => item.label), ['two', 'three', 'one']);
		assert.deepStrictEqual(movedDown.favorites.user.map((item) => item.index), [0, 1, 2]);

		const movedUp = applyFavoriteMove(movedDown.favorites, 'user', 2, 'user', 0);
		assert.deepStrictEqual(movedUp.favorites.user.map((item) => item.label), ['one', 'two', 'three']);
	});

	test('Dropping between scopes moves the favorite before the target', () => {
		const favorites = {
			user: [favorite('user', 0, 'user-one'), favorite('user', 1, 'user-two')],
			workspace: [favorite('workspace', 0, 'workspace-one')]
		};

		const result = applyFavoriteMove(favorites, 'workspace', 0, 'user', 1);

		assert.deepStrictEqual(result.favorites.workspace, []);
		assert.deepStrictEqual(result.favorites.user.map((item) => item.label), [
			'user-one',
			'workspace-one',
			'user-two'
		]);
		assert.strictEqual(result.favorites.user[1].scope, 'user');
		assert.strictEqual(result.favorites.user[1].index, 1);
	});

	test('Dropping on a scope appends the favorite', () => {
		const favorites = {
			user: [favorite('user', 0, 'user-one')],
			workspace: [favorite('workspace', 0, 'workspace-one')]
		};

		const result = applyFavoriteMove(favorites, 'user', 0, 'workspace');
		assert.deepStrictEqual(result.favorites.user, []);
		assert.deepStrictEqual(result.favorites.workspace.map((item) => item.label), [
			'workspace-one',
			'user-one'
		]);
	});
});
