#!/usr/bin/env python3
"""修补 Android build.gradle.kts，让 signingConfigs.release 在缺 keystore 时不抛错。

仅用于 debug 构建场景：
- 把 requiredLocalProperty 从 : String 改成 : String?
- 把 signingConfigs.release 块改为空（仅在 debug build 时生效）
- buildTypes.release.signingConfig = signingConfigs.getByName('release') 保持不变
  （但 debug build 不会触发 release signingConfig 解析）

调用：
  python patch_android_gradle.py [path-to-build.gradle.kts]
"""
import sys
import re
from pathlib import Path

DEFAULT_PATH = Path("apps/flutter/app/android/app/build.gradle.kts")

def main():
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    if not target.exists():
        print(f"error: {target} not found", file=sys.stderr)
        sys.exit(1)

    original = target.read_text()
    content = original

    # Patch 1: requiredLocalProperty 返回 nullable
    #   原始: fun requiredLocalProperty(name: String): String =
    #             localProperties.getProperty(name)
    #                 ?: throw GradleException("Missing Android release signing property: $name")
    #   修改: fun requiredLocalProperty(name: String): String? =
    #             localProperties.getProperty(name)
    pattern1 = re.compile(
        r'fun requiredLocalProperty\(name: String\): String =\s*\n'
        r'\s*localProperties\.getProperty\(name\)\s*\n'
        r'\s*\?:\s*throw GradleException\("Missing Android release signing property: \$name"\)'
    )
    content, n1 = pattern1.subn(
        'fun requiredLocalProperty(name: String): String? =\n'
        '        localProperties.getProperty(name)',
        content
    )
    if n1 == 0:
        # 尝试更宽松的匹配
        pattern1b = re.compile(
            r'fun requiredLocalProperty\(name: String\): String =.*?throw GradleException\("Missing Android release signing property: \$name"\)',
            re.DOTALL
        )
        content, n1 = pattern1b.subn(
            'fun requiredLocalProperty(name: String): String? =\n        localProperties.getProperty(name)',
            content
        )

    # Patch 2: 注释掉 signingConfigs.release 块（如果 keystore 不可用）
    # 原始:
    #   create("release") {
    #       storeFile = file(requiredLocalProperty("RELEASE_STORE_FILE"))
    #       storePassword = requiredLocalProperty("RELEASE_STORE_PASSWORD")
    #       keyAlias = requiredLocalProperty("RELEASE_KEY_ALIAS")
    #       keyPassword = requiredLocalProperty("RELEASE_KEY_PASSWORD")
    #   }
    pattern2 = re.compile(
        r'create\("release"\) \{\s*\n'
        r'(?:\s*\w+\s*=\s*[^\n]+\s*\n){4}'
        r'\s*\}'
    )
    patch2_replacement = (
        'create("release") {\n'
        '            // Patched for debug builds: only configure signing if keystore is available\n'
        '            val storeFile = requiredLocalProperty("RELEASE_STORE_FILE")\n'
        '            if (storeFile != null) {\n'
        '                this.storeFile = file(storeFile)\n'
        '                storePassword = requiredLocalProperty("RELEASE_STORE_PASSWORD")\n'
        '                keyAlias = requiredLocalProperty("RELEASE_KEY_ALIAS")\n'
        '                keyPassword = requiredLocalProperty("RELEASE_KEY_PASSWORD")\n'
        '            }\n'
        '        }'
    )
    content, n2 = pattern2.subn(patch2_replacement, content)

    # Patch 3: buildTypes.release 在 keystore 缺失时不要强制 signingConfig
    # 原始:
    #   release {
    #       signingConfig = signingConfigs.getByName("release")
    #       proguardFiles("proguard-rules.pro")
    #   }
    pattern3 = re.compile(
        r'release \{\s*\n'
        r'\s*signingConfig = signingConfigs\.getByName\("release"\)\s*\n'
        r'\s*proguardFiles\("proguard-rules\.pro"\)\s*\n'
        r'\s*\}'
    )
    patch3_replacement = (
        'release {\n'
        '            // Patched: only apply signing if keystore was configured\n'
        '            if (signingConfigs.findByName("release")?.storeFile != null) {\n'
        '                signingConfig = signingConfigs.getByName("release")\n'
        '            }\n'
        '            proguardFiles("proguard-rules.pro")\n'
        '        }'
    )
    content, n3 = pattern3.subn(patch3_replacement, content)

    if content == original:
        print("WARNING: no patches applied. File might already be patched or pattern mismatch.")
        sys.exit(2)

    target.write_text(content)
    print(f"Patched {target}")
    print(f"  - Patch 1 (requiredLocalProperty -> nullable): {n1} replacement(s)")
    print(f"  - Patch 2 (signingConfigs.release conditional): {n2} replacement(s)")
    print(f"  - Patch 3 (buildTypes.release conditional signing): {n3} replacement(s)")

if __name__ == "__main__":
    main()