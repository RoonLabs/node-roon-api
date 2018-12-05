#!/bin/bash
set -ex

# Save some useful information
REPO=`git config remote.origin.url`
SSH_REPO=${REPO/https:\/\/github.com\//git@github.com:}

rm -rf other
mkdir other
cd other
git clone ${REPO%.git}-browse.git
git clone ${REPO%.git}-image.git
git clone ${REPO%.git}-settings.git
git clone ${REPO%.git}-source-control.git
git clone ${REPO%.git}-status.git
git clone ${REPO%.git}-transport.git
git clone ${REPO%.git}-volume-control.git

cd ..

mkdir -p docs
jsdoc *.js other/*/*.js -d docs

git add docs

git commit -m "Deploy to GitHub Pages"

git subtree push --prefix docs $SSH_REPO gh-pages
