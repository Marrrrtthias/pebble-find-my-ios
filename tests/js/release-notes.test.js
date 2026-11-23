var test = require('node:test');
var assert = require('node:assert/strict');
var releaseNotes = require('../../.github/scripts/release-notes');

test('extracts only the requested version, preserving Markdown and normalizing CRLF', function () {
  var changelog = [
    '# Changelog', '', '## Version 2.3.0', '', '- Future changes', '',
    '## Version 2.2.0', '', '- Fix "sync" and `settings`', '',
    '### Details', '', 'More information.', '',
    '## Version 2.1.0', '', '- Older changes'
  ].join('\r\n');
  assert.equal(releaseNotes(changelog, '2.2.0'),
    '- Fix "sync" and `settings`\n\n### Details\n\nMore information.');
});

test('extracts the last version through the end of the file', function () {
  assert.equal(releaseNotes('# Changelog\n\n## Version 2.0.0\n\nFirst release.\n', '2.0.0'),
    'First release.');
});

test('rejects missing and ambiguous version sections', function () {
  assert.throws(function () {
    releaseNotes('## Version 2.2.01\n\nWrong version.', '2.2.0');
  }, /Expected exactly one/);
  assert.throws(function () {
    releaseNotes('## Version 2.2.0\n\nFirst\n\n## Version 2.2.0\n\nSecond', '2.2.0');
  }, /Expected exactly one/);
});

test('rejects empty notes instead of using the next version', function () {
  assert.throws(function () {
    releaseNotes('## Version 2.2.0\n \n## Version 2.1.0\n\nOlder changes', '2.2.0');
  }, /Empty release notes/);
});
