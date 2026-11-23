'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const panels = fs.readFileSync('src/panels.js', 'utf8');
const admin = fs.readFileSync('src/admin.js', 'utf8');

assert.match(panels, /function getMainPanelButtons\(guildId\)/, 'custom button config reader exists');
assert.match(panels, /main_panel_custom_buttons/, 'custom button definitions persist in guild config');
assert.match(panels, /ButtonStyle\.Link/, 'external link buttons are supported');
assert.match(panels, /public:button:\$\{item\.id\}/, 'internal custom buttons use stable ids');
assert.match(panels, /PANEL_PAGE_TARGETS/, 'internal destination allowlist exists');
assert.match(panels, /getMainPanelButtons\(interaction\.guildId\)\.find/, 'public click resolves current saved button');

for (const operation of ['button-add', 'button-edit', 'button-toggle', 'button-delete', 'button-up', 'button-down']) {
  assert.ok(admin.includes(`admin:content:${operation}`), `admin UI includes ${operation}`);
}
assert.match(admin, /admin:content:button-save:new/, 'new button modal exists');
assert.match(admin, /admin:content:button-save:\$\{button\.id\}/, 'edit button modal exists');
assert.match(admin, /validPanelDestination\(destinationRaw\)/, 'button destinations are validated');
assert.match(admin, /refreshPublishedMainPanel\(interaction\.guild\)/, 'published welcome panel refreshes after edits');
assert.match(admin, /setDisabled\(true\)/, 'empty button menu remains valid after all buttons are removed');

console.log('Panel button management contract tests passed.');
