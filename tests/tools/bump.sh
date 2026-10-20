#!/bin/sh
# 改版本号：登录页 loginBuild 那行和 index.html 里引用上的 ?v= 一起改。用法：sh tests/tools/bump.sh 1021-T2
set -e
cd "$(dirname "$0")/../.."
NEW="$1"; OLD=$(grep -oE 'build [0-9]{4}-[A-Z0-9-]+' www/index.html | head -1 | cut -d' ' -f2)
sed -i "s/build $OLD</build $NEW</; s/?v=$OLD\"/?v=$NEW\"/g" www/index.html
echo "$OLD -> $NEW"; grep -c "?v=$NEW\"" www/index.html
