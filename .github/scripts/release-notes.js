var fs = require('node:fs');
var path = require('node:path');

function releaseNotes(changelog, version) {
  var lines = changelog.split(/\r?\n/);
  var heading = '## Version ' + version;
  var starts = [];
  lines.forEach(function (line, index) {
    if (line.trim() === heading) { starts.push(index); }
  });
  if (starts.length !== 1) {
    throw new Error('Expected exactly one "' + heading + '" section in store/CHANGELOG.md');
  }
  var start = starts[0] + 1;
  var end = start;
  while (end < lines.length && !/^##\s/.test(lines[end])) { end++; }
  var notes = lines.slice(start, end).join('\n').trim();
  if (!notes) {
    throw new Error('Empty release notes for version ' + version + ' in store/CHANGELOG.md');
  }
  return notes;
}

if (require.main === module) {
  var root = path.join(__dirname, '..', '..');
  var version = require(path.join(root, 'package.json')).version;
  var changelog = fs.readFileSync(path.join(root, 'store', 'CHANGELOG.md'), 'utf8');
  process.stdout.write(releaseNotes(changelog, version) + '\n');
}

module.exports = releaseNotes;
