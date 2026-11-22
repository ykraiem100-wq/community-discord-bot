'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_JOIN_WELCOME_TEXT, normalizeJoinWelcomeTemplate, formatJoinWelcomeText } = require('../src/welcome-text');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const adminSource = read('src/admin.js');
const indexSource = read('src/index.js');
const welcomeSource = read('src/join-welcome.js');

assert.equal(DEFAULT_JOIN_WELCOME_TEXT, '🌟 First message from {user}');
assert.equal(normalizeJoinWelcomeTemplate('-#  First message from {user}'), 'First message from {user}');
const formatted = formatJoinWelcomeText('🌟 First message from {user}', {
  id: '123456789012345678',
  displayName: 'New Member',
  user: { username: 'newmember' },
  guild: { name: 'DOS COMMUNITY' }
});
assert.equal(formatted, '-#  🌟 First message from <@123456789012345678>');
assert.match(formatJoinWelcomeText('Welcome {username} to {server}', {
  id: '123456789012345678', displayName: 'Yousef', user: { username: 'yousef' }, guild: { name: 'DOS COMMUNITY' }
}), /^-#\s+Welcome Yousef to DOS COMMUNITY$/);
assert.doesNotMatch(formatJoinWelcomeText('Hello @everyone {user}', {
  id: '123456789012345678', displayName: 'New Member', user: { username: 'new' }, guild: { name: 'Test' }
}), /@everyone/);
assert.doesNotMatch(formatJoinWelcomeText('First line\nSecond line {user}', { id: '123456789012345678', user: { username: 'new' }, guild: { name: 'Test' } }), /\n/);
assert.match(adminSource, /value: 'join_welcome'/);
assert.match(adminSource, /admin:join-welcome:channel/);
assert.match(adminSource, /admin:join-welcome:save/);
assert.match(indexSource, /client\.on\('guildMemberAdd',[\s\S]*?sendJoinWelcome\(member\)/);
assert.match(indexSource, /interaction\.message\.react\(configuredEmoji\.id \|\| configuredEmoji\.name\)/);
assert.match(welcomeSource, /content: text/);
assert.match(welcomeSource, /setEmoji\(parseButtonEmoji\(config\.emoji\)\)/);
console.log('Join welcome text tests passed.');
