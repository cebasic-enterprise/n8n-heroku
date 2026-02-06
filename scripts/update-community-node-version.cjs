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
	const { ModuleRegistry } = require('@n8n/backend-common');
	const { DbConnection } = require('@n8n/db');
	const {
		InstalledPackages,
	} = require('n8n/dist/modules/community-packages/installed-packages.entity');
	const {
		InstalledNodes,
	} = require('n8n/dist/modules/community-packages/installed-nodes.entity');
	const {
		CommunityPackagesService,
	} = require('n8n/dist/modules/community-packages/community-packages.service');

	const packageName =
		process.env.N8N_BRAVE_PACKAGE_NAME || '@brave/n8n-nodes-brave-search';
	const targetVersion = process.env.N8N_BRAVE_PACKAGE_VERSION || '1.0.28';
	const mcpPackageName = process.env.N8N_MCP_PACKAGE_NAME || 'n8n-nodes-mcp';
	const elevenlabsPackageName =
		process.env.N8N_ELEVENLABS_PACKAGE_NAME || '@elevenlabs/n8n-nodes-elevenlabs';
	const elevenlabsVersion = process.env.N8N_ELEVENLABS_PACKAGE_VERSION || undefined;

	const moduleRegistry = Container.get(ModuleRegistry);
	await moduleRegistry.loadModules();

	const db = Container.get(DbConnection);
	await db.init();

	const communityPackagesService = Container.get(CommunityPackagesService);
	await communityPackagesService.ensurePackageJson();

	// Remove MCP community package so it won't be reinstalled on startup
	const existingMcp =
		await communityPackagesService.findInstalledPackage(mcpPackageName);
	if (existingMcp) {
		await communityPackagesService.removePackage(mcpPackageName, existingMcp);
		console.log(`[community-node-update] Removed ${mcpPackageName} from DB`);
	}

	const existing = await communityPackagesService.findInstalledPackage(packageName);
	if (!existing) {
		await communityPackagesService.installPackage(packageName, targetVersion);
		console.log(
			`[community-node-update] Installed ${packageName} at version ${targetVersion}`,
		);
	} else if (existing.installedVersion !== targetVersion) {
		await communityPackagesService.updatePackage(packageName, existing, targetVersion);
		console.log(
			`[community-node-update] Updated ${packageName} from ${existing.installedVersion} to ${targetVersion}`,
		);
	} else {
		console.log(
			`[community-node-update] ${packageName} already at version ${targetVersion}`,
		);
	}

	const elevenInstalled =
		await communityPackagesService.findInstalledPackage(elevenlabsPackageName);
	if (!elevenInstalled) {
		await communityPackagesService.installPackage(elevenlabsPackageName, elevenlabsVersion);
		console.log(
			`[community-node-update] Installed ${elevenlabsPackageName}${elevenlabsVersion ? `@${elevenlabsVersion}` : ''}`,
		);
	} else if (
		elevenlabsVersion &&
		elevenInstalled.installedVersion !== elevenlabsVersion
	) {
		await communityPackagesService.updatePackage(
			elevenlabsPackageName,
			elevenInstalled,
			elevenlabsVersion,
		);
		console.log(
			`[community-node-update] Updated ${elevenlabsPackageName} from ${elevenInstalled.installedVersion} to ${elevenlabsVersion}`,
		);
	}

	await db.close();
}

main().catch((error) => {
	console.error('[community-node-update] Failed to update package version');
	console.error(error);
	process.exitCode = 0;
});
