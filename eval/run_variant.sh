#!/bin/bash
# usage: run_variant.sh tag json
LAT='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
mkdir -p v/$1
while read f; do n=$(basename "$f" .ttf | tr -d '[],'); node run_js.mjs "$f" "$LAT" "$2" v/$1/lat-$n.json >/dev/null || echo FAIL $f; done < fonts_latin.txt
