#!/bin/bash
mkdir -p public build/site build/api
base64 -d site/icon.b64.txt > public/icon.png
cp site/index.html site/app.js site/styles.css site/login.html build/site/
node build/build.js
cp build/api/index.js api/index.js
cp build/api/login.js api/login.js
