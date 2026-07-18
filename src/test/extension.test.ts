import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { rememberRecentCommand } from '../extension';

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
});
