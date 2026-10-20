# Running log of observations (folded into FINDINGS.md)
- 2026-10-20 local: a mod's hooks module cannot import a file outside its plugin folder, even through a symlink (`claude plugin validate`: "it is outside the plugin's folder" / "no such file under"). The shared rules package therefore lives inside the plugin at plugin/rules, dependency-free. Affects 0026.
