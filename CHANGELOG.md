## [2.3.0](https://github.com/dsebastien/obsidian-dataview-serializer/compare/2.2.0...2.3.0) (2026-01-24)

### Features

* **all:** added support for TASK queries ([cea235e](https://github.com/dsebastien/obsidian-dataview-serializer/commit/cea235ef4d3602e5957df3afbf3e798ee1256865))
## [2.2.0](https://github.com/dsebastien/obsidian-dataview-serializer/compare/2.0.0...2.2.0) (2026-01-24)

### Features

* **all:** added a setting to control how links are generated in serialized queries ([eb77405](https://github.com/dsebastien/obsidian-dataview-serializer/commit/eb77405dc02b4f1e7ca3b5501a8161808cbfbed0))
* **all:** added setting to add an extra new line before the end marker ([f0d7351](https://github.com/dsebastien/obsidian-dataview-serializer/commit/f0d7351e1cc47caa482d00ef0133375fd159ec3e))
* **all:** added support for converting dataview queries ([4ee933e](https://github.com/dsebastien/obsidian-dataview-serializer/commit/4ee933eeac770c1b1696fc38e54736045fbd9fa6))
* **all:** added support for multiline queries ([c151b3a](https://github.com/dsebastien/obsidian-dataview-serializer/commit/c151b3a49b4b1a6fce4fb911fae6c819df4b432f))
* **all:** improved query rendering ([83ffd35](https://github.com/dsebastien/obsidian-dataview-serializer/commit/83ffd35ed95db3470982a973385209b482133cfd))

### Bug Fixes

* **all:** fix query matching ([8a6289a](https://github.com/dsebastien/obsidian-dataview-serializer/commit/8a6289a30351a18ee37aca9e6268fcd0128e5b51)), closes [#25](https://github.com/dsebastien/obsidian-dataview-serializer/issues/25)
* **all:** fixed matching issue with idempotency checks vs initial serialized query removal ([2924d97](https://github.com/dsebastien/obsidian-dataview-serializer/commit/2924d9731e4dd87222d1bedde04db70566c0c61a))
## [2.0.0](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.9.0...2.0.0) (2026-01-24)

### Features

* **all:** added command to serialize queries in the current file ([4921016](https://github.com/dsebastien/obsidian-dataview-serializer/commit/4921016ab102f180759d4f26fabe6360d9ec3f0d)), closes [#48](https://github.com/dsebastien/obsidian-dataview-serializer/issues/48)
* **all:** added debug mode and error notices for invalid queries ([f362c98](https://github.com/dsebastien/obsidian-dataview-serializer/commit/f362c986f8cd01adf4811049c5ef7a8b273aa7cd))
* **all:** added support for forcing updates to specific folders ([1f39c53](https://github.com/dsebastien/obsidian-dataview-serializer/commit/1f39c5357b9f120920f937e5aacfab4408c2903e))
* **all:** added support for manual and 'once' queries ([1915517](https://github.com/dsebastien/obsidian-dataview-serializer/commit/1915517bbcada8f02633b4e56a5e00b14120fed0))
* **all:** added support for queries that disappear once serialized (ie only keep the output) ([ac431bf](https://github.com/dsebastien/obsidian-dataview-serializer/commit/ac431bf689e30c2831ad6006f657c3d813425e11))
* **all:** improved look and feel of queries ([2131c96](https://github.com/dsebastien/obsidian-dataview-serializer/commit/2131c96f1a5ac02f21bfbbc681bbc32dd4a27f6d))
* **all:** improved manual query refresh button ([3302e98](https://github.com/dsebastien/obsidian-dataview-serializer/commit/3302e98ecd23b9dc27a2f0994229d9530252d5aa))
* **all:** skip serialization of queries that would cause needless file modifications ([71eb1a8](https://github.com/dsebastien/obsidian-dataview-serializer/commit/71eb1a8d105bb8cf50b6e74ef451b793cc1ce1c0))
* **plugin:** add inline refresh button for Dataview queries ([443bf7d](https://github.com/dsebastien/obsidian-dataview-serializer/commit/443bf7de8e4562600c1396e2e1fe95882f2844cb))

### Bug Fixes

* **all:** wait for all plugins to be loaded to avoid loading this plugin before Dataview ([76f7093](https://github.com/dsebastien/obsidian-dataview-serializer/commit/76f7093f19ee169fd164d9410f09483ca875e85e)), closes [#32](https://github.com/dsebastien/obsidian-dataview-serializer/issues/32)
## [1.9.0](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.8.1...1.9.0) (2026-01-06)
## [1.8.1](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.8.0...1.8.1) (2025-08-03)
## [1.8.0](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.7.3...1.8.0) (2025-05-23)
## [1.7.3](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.7.2...1.7.3) (2025-05-23)
## [1.7.2](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.7.1...1.7.2) (2025-05-23)
## [1.7.1](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.7.0...1.7.1) (2025-05-23)
## [1.7.0](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.6.0...1.7.0) (2025-05-23)
## [1.6.0](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.5.1...1.6.0) (2025-05-23)
## [1.5.1](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.5.0...1.5.1) (2024-11-26)

### Reverts

* Revert "feat: Enable updates to all files, not just recently modified" ([97688c9](https://github.com/dsebastien/obsidian-dataview-serializer/commit/97688c9655d82d70c90c522f65ad9a51c3e9e567))
## [1.5.0](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.4.1...1.5.0) (2024-11-26)

### Features

* Enable updates to all files, not just recently modified ([35cbd62](https://github.com/dsebastien/obsidian-dataview-serializer/commit/35cbd62f4327c4755cf7b6604bac423173432f9d))
## [1.4.1](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.4.0...1.4.1) (2024-10-27)
## [1.4.0](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.3.0...1.4.0) (2024-10-09)
## [1.3.0](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.2.0...1.3.0) (2024-08-25)
## [1.2.0](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.1.5...1.2.0) (2024-07-04)
## [1.1.5](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.1.4...1.1.5) (2024-07-04)
## [1.1.4](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.1.3...1.1.4) (2024-06-05)
## [1.1.3](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.1.2...1.1.3) (2024-06-05)
## [1.1.2](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.1.1...1.1.2) (2024-05-23)
## [1.1.1](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.1.0...1.1.1) (2024-05-22)
## [1.1.0](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.0.5...1.1.0) (2024-05-22)
## [1.0.5](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.0.4...1.0.5) (2024-05-18)
## [1.0.4](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.0.3...1.0.4) (2024-05-16)
## [1.0.3](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.0.2...1.0.3) (2024-05-14)
## [1.0.2](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.0.1...1.0.2) (2024-05-14)
## [1.0.1](https://github.com/dsebastien/obsidian-dataview-serializer/compare/1.0.0...1.0.1) (2024-05-14)
## 1.0.0 (2024-05-13)
