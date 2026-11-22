DOS COMMUNITY — ORIGINAL APPROVED TEMPLATES
============================================

These are exact crops from the original images supplied and approved by the server owner.
The original metallic frames, logo, borders, lighting and composition are retained.

wallet-base.png             active: /wallet and .محفظتي
leaderboard-base.png        active: /top and TOP
shop-base.png               legacy reference; current /shop uses shop-crest-bg.png and one product dropdown
main-panel-base.png         legacy reference; current public panel is rendered dynamically with server icon and seven buttons
content-panel-base.png      active: rules, information and notification-role cards
level-system-base.png       active: system/level infographic
level-up-base.png           active: member level-up announcement
admin-dashboard-base.png   active: /admin-panel home image (kept pixel-identical; live stats are shown separately)
admin-shop-base.png         legacy admin image kept for compatibility; current sections use dynamic DOS headers

src/render.js loads these files by exact name. Do not rename or remove them.
The remaining source screenshots and optional crops are preserved in assets/design-references/.

New generated assets:
shop-crest-bg.png       active: crest-and-treasure background; the live guild icon is drawn into its medallion and the guild name is written beside it
renderMainPanel      draws the current guild icon/name, bilingual welcome copy, owner signature and seven reference-style buttons
renderAdminSection   draws a section-specific admin header for each control-panel page
renderColorWheel     draws a full-spectrum hue/saturation wheel; members enter the chosen HEX value in the modal
