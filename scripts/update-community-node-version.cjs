#!/usr/bin/env node

require('reflect-metadata');

const path = require('path');

process.env.NODE_CONFIG_DIR =
	process.env.NODE_CONFIG_DIR || path.join(__dirname, '..', 'node_modules', 'n8n', 'config');

if (process.env.E2E_TESTS !== 'true') {
	try {
		require('dotenv').config({ quiet: true });
	} catch {
		// Ignore if dotenv is not available
	}
}

// Load n8n config early so @n8n/config picks up environment variables
try {
	require('n8n/dist/config');
} catch (error) {
	console.error('[community-node-update] Failed to load n8n config');
	console.error(error);
	process.exit(1);
}

async function main() {
	const { Container } = require('@n8n/di');
	const { DbConnection } = require('@n8n/db');
	const { DataSource } = require('@n8n/typeorm');
	const {
		InstalledPackages,
	} = require('n8n/dist/modules/community-packages/installed-packages.entity');

	const packageName =
		process.env.N8N_BRAVE_PACKAGE_NAME || '@brave/n8n-nodes-brave-search';
	const targetVersion = process.env.N8N_BRAVE_PACKAGE_VERSION || '1.0.28';

	const db = Container.get(DbConnection);
	await db.init();

	const dataSource = Container.get(DataSource);
	const repo = dataSource.getRepository(InstalledPackages);

	const existing = await repo.findOneBy({ packageName });

	if (!existing) {
		console.log(`[community-node-update] Package not found in DB: ${packageName}`);
		await db.close();
		return;
	}

	if (existing.installedVersion === targetVersion) {
		console.log(
			`[community-node-update] ${packageName} already at version ${targetVersion}`,
		);
		await db.close();
		return;
	}

	await repo.update({ packageName }, { installedVersion: targetVersion });

	console.log(
		`[community-node-update] Updated ${packageName} from ${existing.installedVersion} to ${targetVersion}`,
	);

	await db.close();
}

main().catch((error) => {
	console.error('[community-node-update] Failed to update package version');
	console.error(error);
	process.exit(1);
});
