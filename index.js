const { exec } = require("child_process");
const { get } = require("https");
const { promisify } = require("util");
const execAsync = promisify(exec);
const getAsync = url => new Promise(resolve => get(url, resolve));

const commit = `master...head`;
const allowedChanges = "cnames_active.js";

function jsonParse(data) {
  try {
    return JSON.parse(data);
  } catch (e) {}
}

async function verifyDomain(domain, target) {
  const { headers, statusCode } = await getAsync(target);
  console.assert(
    statusCode >= 300 && statusCode < 400,
    "${target} has to redirect using a CNAME file"
  );
  const targetLocation = String(headers.location).replace(/^https/, "http");
  console.assert(
    targetLocation === domain,
    `${target} is redirecting to ${targetLocation} instead of ${domain}`
  );
}

const result = (async () => {
  const filesDiffExec = await execAsync(`git diff "${commit}" --name-only`);
  const filesChanged = filesDiffExec.stdout.split("\n").filter(file => file);

  const fileDiffs = await Promise.all(
    filesChanged.map(async fileName => {
      const fileDiffExec = await execAsync(
        `git diff "${commit}" "${fileName}"`
      );
      const fileChanges = fileDiffExec.stdout.split("\n");
      return {
        fileName,
        lines: fileChanges.slice(1, 2)[0],
        linesAdded: fileChanges
          .slice(5)
          .filter(line => line.startsWith("+"))
          .map(line => line.substr(1)),
        linesRemoved: fileChanges
          .slice(5)
          .filter(line => line.startsWith("-"))
          .map(line => line.substr(1))
      };
    })
  );

  console.log("Verifying file changes");

  console.assert(fileDiffs.length > 0, `No changes detected.`);
  console.assert(
    fileDiffs.length === 1,
    `You may change only ${allowedChanges}`
  );
  console.assert(
    fileDiffs[0].fileName === allowedChanges,
    `You may change only ${allowedChanges}`
  );
  console.assert(
    fileDiffs[0].linesRemoved.length === 0,
    `You must not remove existing lines`
  );
  console.assert(
    fileDiffs[0].linesAdded.length === 1,
    `You may only add one line per pull request`
  );

  const { _, ...parseAddedLine } = jsonParse(
    `{${fileDiffs[0].linesAdded[0] + '"_":""'}}`
  );
  console.assert(
    typeof parseAddedLine === "object",
    `Could not parse ${fileDiffs[0].linesAdded[0]}`
  );
  console.log("Found one additonal entry: ", parseAddedLine);

  const domainName = Object.keys(parseAddedLine)[0];
  const domainTarget = parseAddedLine[domainName];

  console.log("Verifiying CNAME file");
  await verifyDomain(`http://${domainName}.js.org`, `https://${domainTarget}`);

  console.log("All tests passed");
})();

// Exit in case of any error
result.catch(err => {
  console.error("\\!/ " + "-".repeat(err.message.length));
  console.error("\\!/ " + err.message);
  console.error("\\!/ " + "-".repeat(err.message.length));
  process.exit(1);
});