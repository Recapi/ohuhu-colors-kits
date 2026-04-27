# Ohuhu Colors

A static, browser-only catalog for Ohuhu marker colors and kit comparison.

This folder is the GitHub Pages version of the project. It runs entirely in the browser: colors, kits, prices, edited HEX values, imports, and exports are stored in `localStorage`.

## Static App Files

- [`index.html`](index.html) is the GitHub Pages shell.
- [`app.js`](app.js) handles routing, rendering, local state, import/export, and comparisons.
- [`i18n.js`](i18n.js) provides English and Portuguese UI text.
- [`db.json`](db.json) is the bundled snapshot used on first load or after reset.
- [`style.css`](style.css) contains the visual design.

## Features

- Browse Ohuhu colors with filters for code families, missing HEX values, and missing images.
- Sort by original order, code, kit usage, hue, or lightness.
- View a color detail page with official image, stored HEX, older codes, and kit membership.
- Create, disable, price, and edit kits locally in the browser.
- Compare kits as a single selection or as A vs. B groups.
- Export/import the local browser database as JSON.
- Switch UI language between English and Portuguese.

## Data Sources and Credits

This project builds on community research and official Ohuhu data:

- Inspired by the Reddit thread ["Help Creating A Ohuhu Hex Chart Or Conversion Chart"](https://www.reddit.com/r/Ohuhu/comments/1i4bm7a/help_creating_a_ohuhu_hex_chart_or_conversion/) by [`u/justwingingitcolorin`](https://www.reddit.com/user/justwingingitcolorin/).
- Community reference data was checked against the ["OHUHU COLOR RANGE TRACKER 2025 EDITION"](https://docs.google.com/spreadsheets/d/1orLtYzDGpHBoGfPVwXN3WWqKfhFpAdmJV52BbdICKzs/edit?usp=drivesdk), published from ["Ohuhu Color Range Tracker"](https://www.reddit.com/r/Ohuhu/comments/q7v5dp/ohuhu_color_range_tracker/) by [`u/mjdolorico1234`](https://www.reddit.com/user/mjdolorico1234/). This appears to be the community "big Ohuhu legend" style reference used for cross-set color tracking.
- New-code conversion details were also cross-checked with [`u/MissReena`](https://www.reddit.com/user/MissReena/)'s post ["Spreadsheet with new numbering system - Honolulu, Oahu, and Kaala"](https://www.reddit.com/r/Ohuhu/comments/1lv1kc1/spreadsheet_with_new_numbering_system_honolulu/).
- Official color-code and image metadata was taken from Ohuhu's [Color Codes Index](https://br.ohuhu.com/pages/color-codes-index), including its embedded TableMaster data endpoint.

Ohuhu is a trademark of its respective owner. This is an unofficial community tool.
