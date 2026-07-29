import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.resolve(scriptDirectory, "..");
const repositoryDirectory = path.resolve(packageDirectory, "..");
const stagingDirectory = path.resolve(packageDirectory, ".mcpb-stage");
const outputDirectory = path.resolve(
  repositoryDirectory,
  "merxet-promo",
  "public",
  "downloads",
);

if (
  path.dirname(stagingDirectory) !== packageDirectory ||
  path.basename(stagingDirectory) !== ".mcpb-stage"
) {
  throw new Error("Refusing to use an unexpected MCPB staging directory.");
}

const readJson = async (filename) =>
  JSON.parse(await fs.readFile(filename, "utf8"));

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: packageDirectory,
      stdio: "inherit",
      ...options,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }`,
        ),
      );
    });
  });

const packageJsonPath = path.join(packageDirectory, "package.json");
const packageLockPath = path.join(packageDirectory, "package-lock.json");
const manifestSourcePath = path.join(
  packageDirectory,
  "mcpb",
  "manifest.json",
);
const ignoreSourcePath = path.join(
  packageDirectory,
  "mcpb",
  ".mcpbignore",
);
const iconSourcePath = path.join(
  repositoryDirectory,
  "merxet-promo",
  "public",
  "logo-t-g-512x512.png",
);
const npmCliPath = process.env.npm_execpath;
const mcpbPackageDirectory = path.join(
  packageDirectory,
  "node_modules",
  "@anthropic-ai",
  "mcpb",
);
const mcpbPackageJson = await readJson(
  path.join(mcpbPackageDirectory, "package.json"),
);
const mcpbCliPath = path.join(mcpbPackageDirectory, mcpbPackageJson.bin);

if (!npmCliPath || !path.isAbsolute(npmCliPath)) {
  throw new Error("Run the MCPB build through npm so npm_execpath is available.");
}

const packageJson = await readJson(packageJsonPath);
const manifest = await readJson(manifestSourcePath);

if (manifest.version !== packageJson.version) {
  throw new Error(
    `MCPB manifest version ${manifest.version} does not match package version ${packageJson.version}.`,
  );
}

if (
  manifest.server?.entry_point !== "dist/server.js" ||
  manifest.server?.mcp_config?.command !== "node"
) {
  throw new Error("MCPB manifest must launch the bundled Node server.");
}

const artifactName = `merxet-${manifest.version}.mcpb`;
const artifactPath = path.join(outputDirectory, artifactName);
const checksumPath = `${artifactPath}.sha256`;

await fs.rm(stagingDirectory, { recursive: true, force: true });
await fs.mkdir(stagingDirectory, { recursive: true });
await fs.mkdir(outputDirectory, { recursive: true });

try {
  await fs.cp(
    path.join(packageDirectory, "dist"),
    path.join(stagingDirectory, "dist"),
    { recursive: true },
  );
  await fs.copyFile(
    packageJsonPath,
    path.join(stagingDirectory, "package.json"),
  );
  await fs.copyFile(
    packageLockPath,
    path.join(stagingDirectory, "package-lock.json"),
  );
  await fs.copyFile(
    manifestSourcePath,
    path.join(stagingDirectory, "manifest.json"),
  );
  await fs.copyFile(
    ignoreSourcePath,
    path.join(stagingDirectory, ".mcpbignore"),
  );
  await fs.copyFile(iconSourcePath, path.join(stagingDirectory, "icon.png"));

  await run(
    process.execPath,
    [
      npmCliPath,
      "ci",
      "--omit=dev",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    { cwd: stagingDirectory },
  );

  await fs.writeFile(
    path.join(stagingDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "@merxet/mcp-bundle-runtime",
        version: packageJson.version,
        private: true,
        type: "module",
        engines: packageJson.engines,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await fs.rm(path.join(stagingDirectory, "node_modules", ".package-lock.json"), {
    force: true,
  });

  const smokeClient = new Client({
    name: "merxet-mcpb-smoke",
    version: packageJson.version,
  });
  const smokeTransport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(stagingDirectory, "dist", "server.js")],
  });
  try {
    await smokeClient.connect(smokeTransport);
    const tools = await smokeClient.listTools();
    const toolNames = new Set(tools.tools.map((tool) => tool.name));
    for (const expected of [
      "create_merxet_order",
      "get_merxet_order_status",
    ]) {
      if (!toolNames.has(expected)) {
        throw new Error(`Bundled server did not expose ${expected}.`);
      }
    }
  } finally {
    await smokeClient.close();
  }

  await fs.rm(artifactPath, { force: true });
  await fs.rm(checksumPath, { force: true });

  await run(process.execPath, [mcpbCliPath, "validate", stagingDirectory]);
  await run(process.execPath, [
    mcpbCliPath,
    "pack",
    stagingDirectory,
    artifactPath,
  ]);
  await run(process.execPath, [mcpbCliPath, "info", artifactPath]);

  const artifact = await fs.readFile(artifactPath);
  const checksum = createHash("sha256").update(artifact).digest("hex");
  await fs.writeFile(
    checksumPath,
    `${checksum}  ${artifactName}\n`,
    "utf8",
  );

  console.log(`Created ${artifactPath}`);
  console.log(`SHA-256 ${checksum}`);
} finally {
  await fs.rm(stagingDirectory, { recursive: true, force: true });
}
