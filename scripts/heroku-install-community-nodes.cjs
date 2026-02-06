#!/usr/bin/env node

const { execFile } = require('node:child_process');
const { mkdir, access, writeFile, readFile } = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');

const asyncExecFile = promisify(execFile);

const DEFAULT_PACKAGES = [
	'@elevenlabs/n8n-nodes-elevenlabs',
];

function getNodesDownloadDir() {
	const homeVarName = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';
	const userHome = process.env.N8N_USER_FOLDER ?? process.env[homeVarName] ?? process.cwd();
	return path.join(userHome, '.n8n', 'nodes');
}

async function ensurePackageJson(packageJsonPath) {
	try {
		await access(packageJsonPath);
	} catch {
		await mkdir(path.dirname(packageJsonPath), { recursive: true });
		const content = {
			name: 'installed-nodes',
			private: true,
			dependencies: {},
		};
		await writeFile(packageJsonPath, JSON.stringify(content, null, 2), 'utf-8');
		return;
	}

	// Ensure dependencies exists
	const raw = await readFile(packageJsonPath, 'utf-8');
	const json = JSON.parse(raw);
	if (!json.dependencies) {
		json.dependencies = {};
		await writeFile(packageJsonPath, JSON.stringify(json, null, 2), 'utf-8');
	}
}

async function installPackage(nodesDir, pkg, version) {
	const pkgWithVersion = version ? `${pkg}@${version}` : pkg;
	console.log(`[community-build] Installing ${pkgWithVersion} into ${nodesDir}`);
	await asyncExecFile('npm', [
		'install',
		pkgWithVersion,
		'--ignore-scripts',
		'--no-package-lock',
		'--omit=dev',
		'--fund=false',
		'--audit=false',
		`--prefix=${nodesDir}`,
	]);
}

function packageInstallPath(nodesDir, pkg) {
	if (pkg.startsWith('@')) {
		const [scope, name] = pkg.split('/');
		return path.join(nodesDir, 'node_modules', scope, name);
	}
	return path.join(nodesDir, 'node_modules', pkg);
}

async function main() {
	const nodesDir = getNodesDownloadDir();
	const packageJsonPath = path.join(nodesDir, 'package.json');
	await ensurePackageJson(packageJsonPath);

	const packages = process.env.N8N_COMMUNITY_BUILD_PACKAGES
		? process.env.N8N_COMMUNITY_BUILD_PACKAGES.split(',').map((p) => p.trim()).filter(Boolean)
		: DEFAULT_PACKAGES;

	const elevenlabsVersion = process.env.N8N_ELEVENLABS_PACKAGE_VERSION || '';

	for (const pkg of packages) {
		const version = pkg === '@elevenlabs/n8n-nodes-elevenlabs' ? elevenlabsVersion : '';
		const installPath = packageInstallPath(nodesDir, pkg);
		try {
			await access(path.join(installPath, 'package.json'));
			console.log(`[community-build] ${pkg} already installed at ${installPath}`);
			continue;
		} catch {
			// not installed yet
		}
		await installPackage(nodesDir, pkg, version);
	}
}

main().catch((error) => {
	console.error('[community-build] Failed to install community nodes');
	console.error(error);
	process.exit(1);
});
