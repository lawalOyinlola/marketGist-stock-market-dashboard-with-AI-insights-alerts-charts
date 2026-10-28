// Fails when pnpm-lock.yaml holds a package version published less than
// minimumReleaseAge ago, unless pnpm-workspace.yaml lists it under
// minimumReleaseAgeExclude. pnpm applies minimumReleaseAge only while it
// resolves versions; `pnpm install --frozen-lockfile` reads the lockfile as
// is and never checks it, so CI needs this separate check.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const lockfile = readFileSync("pnpm-lock.yaml", "utf8");

// Ask pnpm for its settings so the YAML is parsed by pnpm itself. This keeps
// every list style pnpm accepts working, such as an unindented `- react`.
function pnpmSetting(key) {
  const out = execFileSync("pnpm", ["config", "get", key, "--json"], {
    encoding: "utf8",
  }).trim();
  return out ? JSON.parse(out) : undefined;
}

const minutes = Number(pnpmSetting("minimumReleaseAge"));
if (!Number.isFinite(minutes) || minutes <= 0) {
  console.error("minimumReleaseAge is missing from pnpm-workspace.yaml");
  process.exit(1);
}

// Each entry is a package-name pattern, where * matches any characters, or
// `name@1.0.0 || 1.0.1` for exact versions of one package.
const excludeRules = (pnpmSetting("minimumReleaseAgeExclude") ?? []).map(
  (entry) => {
    const at = entry.lastIndexOf("@");
    const hasVersions = at > 0;
    const pattern = (hasVersions ? entry.slice(0, at) : entry).trim();
    const regex = new RegExp(
      `^${pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`
    );
    const versions = hasVersions
      ? new Set(entry.slice(at + 1).split("||").map((v) => v.trim()))
      : null;
    return { regex, versions };
  }
);

function isExcluded(name, version) {
  return excludeRules.some(
    (rule) => rule.regex.test(name) && (!rule.versions || rule.versions.has(version))
  );
}

// Keys in the `packages:` section look like `name@1.2.3:` or `'@scope/name@1.2.3':`.
const packagesSection = lockfile.match(/^packages:\n([\s\S]*?)(?=^\S)/m)?.[1] ?? "";
const entries = [...packagesSection.matchAll(/^ {2}'?(@?[^@'\s]+)@([^:'\s]+)'?:/gm)].map(
  (m) => ({ name: m[1], version: m[2] })
);
if (entries.length === 0) {
  console.error("No packages found in pnpm-lock.yaml");
  process.exit(1);
}

const cutoff = Date.now() - minutes * 60 * 1000;
const byName = Map.groupBy(entries, (e) => e.name);
const young = [];
const failed = [];

async function check([name, versions]) {
  const url = `https://registry.npmjs.org/${name.replaceAll("/", "%2f")}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { time } = await res.json();
    for (const { version } of versions) {
      const published = Date.parse(time?.[version]);
      if (Number.isNaN(published)) {
        failed.push(`${name}@${version}: no publish time in registry`);
      } else if (published > cutoff && !isExcluded(name, version)) {
        young.push(`${name}@${version} (published ${time[version]})`);
      }
    }
  } catch (err) {
    failed.push(`${name}: ${err.message}`);
  }
}

const queue = [...byName];
await Promise.all(
  Array.from({ length: 16 }, async () => {
    for (let item = queue.pop(); item; item = queue.pop()) await check(item);
  })
);

if (young.length || failed.length) {
  if (young.length) {
    console.error(
      `Versions younger than ${minutes / 1440} days and not excluded:\n  ${young.sort().join("\n  ")}`
    );
  }
  if (failed.length) {
    console.error(`Could not verify:\n  ${failed.sort().join("\n  ")}`);
  }
  process.exit(1);
}
console.log(
  `OK: ${entries.length} locked versions, all older than ${minutes / 1440} days or excluded.`
);
