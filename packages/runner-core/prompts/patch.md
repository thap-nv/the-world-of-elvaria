<!-- The territory's patch paths (laws.patch_paths, P1-28): paths a CLI refuses to write whatever its rules say
(Claude Code: .husky/, .claude/…), which the territory lets the Steward change through the assignee's patch. Added
after P1-16, where a knight could not edit .husky/pre-push and had to ask the owner. {{patch_file}} is PATCH_FILE of
runner-core; the hook names it too when it refuses such a write. Empty for a session without a write tool, and when
the territory has no patch path (a territory without git has none). -->

# Changes through a patch

The territory lets the Steward change these paths for you:

{{paths}}

When your tools refuse to write one of them (your CLI guards some folders, such as `.husky/`, whatever its rules say), do not ask the owner for the change. Write it as a git patch to `{{patch_file}}` at the root of your plot, in the form `git diff` prints, with paths from the root of the plot:

```diff
diff --git a/<path> b/<path>
--- a/<path>
+++ b/<path>
@@ -<line>,<count> +<line>,<count> @@
 <a line kept as it is>
-<a line taken out>
+<a line put in>
```

A new file has `new file mode 100644` (`100755` for a script) after the first line and `--- /dev/null`. When your session completes, the Steward applies the patch before it commits your work, then deletes the file; the judge reads the change in your diff. A patch that touches any other path, or that does not apply, is not applied at all, and the quest goes to the infirmary instead of review. Change every other path with your tools, as usual.
